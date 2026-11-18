import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, session, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const product = 'NAC 路由设计工作室';
const requestedData = process.env.NAC_STUDIO_DATA;
const portable = process.env.NAC_STUDIO_PORTABLE === '1';
const data = resolve(requestedData || join(process.env.LOCALAPPDATA || app.getPath('appData'), 'NAC路由设计工作室'));
const previousProfile = join(data, '独立界面配置');
const profile = portable && !existsSync(previousProfile) ? join(data, 'profile') : previousProfile;
const legacyProfile = join(data, '桌面界面配置');
const defaultPort = 43292;
const preload = fileURLToPath(new URL('./preload.cjs', import.meta.url));
const projectLaunchFlag = '--nac-open=';
const projectFilters = [{ name:'NAC 工程', extensions:['nac', 'json'] }];
const launchFiles = new Map();
let deliverProjectLaunches = () => {};

function isProjectPath(path) {
  return typeof path === 'string' && isAbsolute(path) && /\.nac(?:\.json)?$/i.test(path);
}

function enqueueProjectLaunch(path) {
  if (!portable || !isProjectPath(path)) return;
  launchFiles.set(`launch:${randomUUID()}`, path);
  deliverProjectLaunches();
}

function readPort(file) {
  try {
    const value = Number(readFileSync(file, 'utf8').trim());
    if (Number.isInteger(value) && value >= 1 && value <= 65535) return value;
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(error);
  }
  return null;
}

function migrateInterfaceStorage() {
  const storagePath = ['Local Storage', 'leveldb'];
  const target = join(profile, ...storagePath);
  const webview = join(legacyProfile, 'EBWebView', 'Default', ...storagePath);
  const browser = join(data, '界面配置', 'Default', ...storagePath);
  const fromWebView = existsSync(join(webview, 'CURRENT'));
  const source = fromWebView ? webview : browser;
  const portFile = join(profile, profile === previousProfile ? '界面端口.txt' : 'origin-port.txt');
  const port = readPort(portFile) ?? (fromWebView
    ? readPort(join(legacyProfile, '最近端口.txt')) ?? defaultPort
    : existsSync(join(browser, 'CURRENT')) ? 43291 : defaultPort);
  if (!existsSync(target) && existsSync(join(source, 'CURRENT'))) {
    mkdirSync(dirname(target), { recursive:true });
    const staging = mkdtempSync(join(dirname(target), '.迁移-'));
    try {
      for (const name of readdirSync(source)) {
        if (name === 'CURRENT' || /^MANIFEST-\d+$|^\d+\.(?:ldb|log|sst)$/.test(name)) {
          copyFileSync(join(source, name), join(staging, name));
        }
      }
      renameSync(staging, target);
    } catch (error) {
      console.warn('无法迁移旧版界面设置', error);
    } finally {
      rmSync(staging, { recursive:true, force:true });
    }
  }
  writeFileSync(portFile, String(port));
  return `http://127.0.0.1:${port}`;
}

function useFileDialogs(desktopSession, origin) {
  let downloadDirectory = app.getPath('downloads');
  desktopSession.on('will-download', (event, item) => {
    const name = basename(item.getFilename());
    const ext = extname(name).toLowerCase();
    if (item.getInitiatorOrigin() !== origin || !item.getURL().startsWith(`blob:${origin}/`) ||
        (ext !== '.json' && !(portable && ext === '.nac'))) {
      event.preventDefault();
      return;
    }
    item.setSaveDialogOptions({
      title:'保存 NAC 文件',
      defaultPath:join(downloadDirectory, name),
      filters:[{ name:ext === '.nac' ? 'NAC 工程' : 'JSON 文件', extensions:[ext.slice(1)] }],
      properties:['showOverwriteConfirmation'],
    });
    item.once('done', (_, state) => {
      if (state === 'completed') downloadDirectory = dirname(item.getSavePath());
    });
  });
}

function allowCloseAfterSaving(window, origin) {
  const view = window.webContents;
  const isWorkspace = event => event.sender === view && event.senderFrame === view.mainFrame &&
    URL.parse(event.senderFrame?.url ?? '')?.origin === origin;
  let allowClose = false;
  let reply;
  const onTheme = (event, theme) => {
    if (isWorkspace(event) && ['system', 'dark', 'light'].includes(theme)) nativeTheme.themeSource = theme;
  };
  const onSave = (event, saved) => {
    if (isWorkspace(event)) reply?.(saved === true);
  };
  ipcMain.on('nac:theme', onTheme);
  ipcMain.on('nac:close-result', onSave);
  view.on('will-prevent-unload', event => {
    if (allowClose) event.preventDefault();
  });
  window.on('close', async event => {
    if (allowClose || view.isCrashed() || !view.getURL()) return;
    event.preventDefault();
    if (reply) return;
    let timer;
    const saved = await new Promise(resolve => {
      reply = resolve;
      timer = setTimeout(() => resolve(false), 6000);
      view.send('nac:close-request');
    });
    clearTimeout(timer);
    if (window.isDestroyed()) return;
    if (!saved) {
      const { response } = await dialog.showMessageBox(window, {
        type:'warning', title:'关闭工作室', message:'无法确认所有修改都已保存。',
        detail:'是否仍然关闭工作室？', buttons:['继续编辑', '仍然关闭'], defaultId:0, cancelId:0,
      });
      if (response !== 1) { reply = null; return; }
    }
    allowClose = true;
    window.close();
  });
  window.on('closed', () => {
    reply?.(false);
    ipcMain.removeListener('nac:theme', onTheme);
    ipcMain.removeListener('nac:close-result', onSave);
  });
}

function usePortableProjects(window, origin, service) {
  const view = window.webContents;
  let ready = false;
  const delivered = new Set();
  const handlers = [];
  const handle = (channel, callback) => {
    handlers.push(channel);
    ipcMain.handle(channel, async (event, argument) => {
      if (event.sender !== view || event.senderFrame !== view.mainFrame ||
          URL.parse(event.senderFrame?.url ?? '')?.origin !== origin) return { error:'此操作只可在工作室中使用。' };
      try { return { value:await callback(argument) }; }
      catch (error) { return { error:error.message }; }
    });
  };

  deliverProjectLaunches = () => {
    if (!ready || view.isDestroyed()) return;
    for (const key of launchFiles.keys()) {
      if (delivered.has(key)) continue;
      view.send('nac:portable-launch', key);
      delivered.add(key);
    }
  };
  view.on('did-start-loading', () => { ready = false; delivered.clear(); });
  handle('nac:portable-ready', () => { ready = true; deliverProjectLaunches(); });
  handle('nac:portable-pick-project', async () => {
    const picked = await dialog.showOpenDialog(window, {
      title:'打开 NAC 工程', defaultPath:await service.getPortableProjectFolder(),
      filters:projectFilters, properties:['openFile'],
    });
    return picked.canceled ? null : service.openPortableProjectFile(picked.filePaths[0]);
  });
  handle('nac:portable-open-project', async key => {
    if (typeof key !== 'string' || key.length > 200) throw Error('工程标识无效。');
    if (!key.startsWith('launch:')) return service.openPortableProjectKey(key);
    const path = launchFiles.get(key);
    if (!path) throw Error('这次工程打开请求已处理。');
    launchFiles.delete(key);
    delivered.delete(key);
    return service.openPortableProjectFile(path);
  });
  handle('nac:portable-pick-folder', async () => {
    const picked = await dialog.showOpenDialog(window, {
      title:'选择工程文件夹', defaultPath:await service.getPortableProjectFolder(),
      properties:['openDirectory', 'createDirectory'],
    });
    return picked.canceled ? null : service.pickPortableProjectFolder(picked.filePaths[0]);
  });
  window.on('closed', () => {
    for (const channel of handlers) ipcMain.removeHandler(channel);
    deliverProjectLaunches = () => {};
  });
}

async function openWorkspace(origin, service) {
  const desktopSession = session.defaultSession;
  desktopSession.protocol.handle('http', request => service.respond(request, origin));
  desktopSession.webRequest.onBeforeRequest({
    urls:['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'],
  }, (details, done) => done({ cancel:URL.parse(details.url)?.origin !== origin }));
  desktopSession.setPermissionCheckHandler(() => false);
  desktopSession.setPermissionRequestHandler((_view, _permission, callback) => callback(false));
  useFileDialogs(desktopSession, origin);
  Menu.setApplicationMenu(null);

  const window = new BrowserWindow({
    title:product, width:1360, height:860, minWidth:660, minHeight:480,
    backgroundColor:'#1e1e1e', show:false,
    icon:fileURLToPath(new URL('./icon.ico', import.meta.url)),
    webPreferences:{
      preload, sandbox:true, contextIsolation:true, nodeIntegration:false, spellcheck:false, devTools:false,
      additionalArguments:portable ? ['--nac-portable'] : [],
    },
  });
  const view = window.webContents;
  view.on('will-navigate', event => {
    if (URL.parse(event.url)?.origin !== origin) event.preventDefault();
  });
  view.setWindowOpenHandler(({ url }) => {
    const target = URL.parse(url);
    if (target?.protocol === 'https:' && target.origin !== origin) {
      void shell.openExternal(target.href).catch(error => dialog.showErrorBox('无法打开链接', error.message));
    }
    return { action:'deny' };
  });
  allowCloseAfterSaving(window, origin);
  if (portable) usePortableProjects(window, origin, service);
  window.once('ready-to-show', () => {
    window.maximize();
    window.show();
  });
  await window.loadURL(origin);
}

function startupError(error) {
  console.error(error);
  dialog.showErrorBox('无法启动 NAC 路由设计工作室', error.message);
  app.exit(1);
}

try {
  process.env.NAC_STUDIO_DATA = data;
  app.setName(product);
  app.setAppUserModelId('NAC.RouteStudio');
  app.commandLine.appendSwitch('disable-background-networking');
  const debugPort = Number(process.env.NAC_STUDIO_DEBUG_PORT);
  if (requestedData && Number.isInteger(debugPort) && debugPort >= 1024 && debugPort <= 65535) {
    app.commandLine.appendSwitch('remote-debugging-port', String(debugPort));
    app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
  }
  mkdirSync(profile, { recursive:true });
  app.setPath('userData', profile);
  const initialProject = portable ? process.argv.find(arg => arg.startsWith(projectLaunchFlag))?.slice(projectLaunchFlag.length) : null;
  if (process.argv.includes('--no-open')) {
    const { startHttpServer } = await import('../server.mjs');
    startHttpServer({ onFatal:() => app.exit(1) });
  } else if (!app.requestSingleInstanceLock(initialProject ? { nacProject:initialProject } : {})) {
    app.quit();
  } else {
    const origin = migrateInterfaceStorage();
    enqueueProjectLaunch(initialProject);
    app.on('second-instance', (_event, _argv, _directory, details) => {
      enqueueProjectLaunch(details?.nacProject);
      const [window] = BrowserWindow.getAllWindows();
      if (!window) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    });
    const service = await import('../server.mjs');
    void app.whenReady().then(() => openWorkspace(origin, service)).catch(startupError);
  }
} catch (error) {
  startupError(error);
}
