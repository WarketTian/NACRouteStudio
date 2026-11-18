import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { HISTORY_BYTES, normalizeOperationHistory } from './src/operation-history.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './src/project.js';

const root = dirname(fileURLToPath(import.meta.url));
const data = resolve(process.env.NAC_STUDIO_DATA || join(process.env.LOCALAPPDATA || root, 'NAC路由设计工作室'));
const portable = process.env.NAC_STUDIO_PORTABLE === '1';
function dataEntry(name, previousName) {
  const previous = join(data, previousName);
  return !portable || existsSync(previous) ? previous : join(data, name);
}
const projects = dataEntry('projects', '工程');
const legacyProjects = join(data, '旧版工程');
const portableSettingsPath = dataEntry('workspace.json', '便携工程设置.json');
const build = process.env.NAC_STUDIO_BUILD || null;
const explicitPort = process.env.NAC_STUDIO_PORT;
const firstPort = Number(explicitPort || (build ? 43292 : 43291));
let port = firstPort;
const host = '127.0.0.1';
const applicationUrl = () => `http://${host}:${port}`;
const pageHeaders = {
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};
const maxProject = 8 * 1024 * 1024;
const maxBackups = 30;
const maxProjectFile = (maxBackups + 1) * (maxProject + 512) + HISTORY_BYTES + 4096;
const maxCatalog = 80 * 1024 * 1024;
const validId = /^[a-zA-Z0-9_-]{1,80}$/;
const validStamp = /^\d{8}T\d{9}Z-[a-f0-9]{8}$/;
const projectFilePattern = /^nac-([a-zA-Z0-9_-]{1,80})\.nac\.json$/;
const missingProject = Symbol('missing project file');
const portableExtension = /\.nac(?:\.json)?$/i;
const fingerprint = bytes => createHash('sha256').update(bytes).digest('hex');
const contentTypes = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.webp':'image/webp', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.zip':'application/zip', '.ico':'image/x-icon' };
let writes = Promise.resolve();

function serialized(fn) {
  const result = writes.then(fn);
  writes = result.catch(() => {});
  return result;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers:{ ...pageHeaders, 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' },
  });
}

function fail(status, message) { throw Object.assign(new Error(message), { status }); }

async function readJson(path, fallback = null) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (err) { if (err.code === 'ENOENT') return fallback; throw err; }
}

async function atomicWrite(path, value, { beforeCommit, createDirectory = true } = {}) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const contents = JSON.stringify(value);
  if (createDirectory) await mkdir(dirname(path), { recursive:true });
  try {
    await writeFile(temporary, contents, { flag:'wx' });
    for (const retryDelay of [20,40,80,160,0]) {
      if (beforeCommit) await beforeCommit();
      try { await rename(temporary, path); break; }
      catch (err) {
        if (!retryDelay || process.platform !== 'win32' || !['EPERM','EACCES','EBUSY'].includes(err.code)) throw err;
        await delay(retryDelay);
      }
    }
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return contents;
}

async function body(req, limit) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) fail(415, '需要 JSON 数据');
  let size = 0;
  const chunks = [];
  for await (const chunk of req.body ?? []) {
    size += chunk.length;
    if (size > limit) fail(413, '文件超过大小限制');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail(400, '无法读取 JSON 数据'); }
}

function isProject(project, id) {
  return project?.id === id && project.schema === 1 && typeof project.name === 'string' &&
    Array.isArray(project.modules) && project.modules.length === 12 &&
    Array.isArray(project.ports) && Array.isArray(project.routes) && Array.isArray(project.circuits);
}

const projectPath = id => join(projects, `nac-${id}.nac.json`);

function projectFile(saved, backups) {
  return { format:PROJECT_FILE_FORMAT, version:PROJECT_FILE_VERSION, ...saved, backups };
}

function currentSnapshot(file) {
  const { revision, updatedAt, project, operationHistory } = file;
  return { revision, updatedAt, project, ...(operationHistory && { operationHistory }) };
}

function isSavedProject(saved, id) {
  return isProject(saved?.project, id) && Number.isSafeInteger(saved.revision) && saved.revision > 0 &&
    typeof saved.updatedAt === 'string' && Number.isFinite(Date.parse(saved.updatedAt));
}

function isBackup(backup, id) {
  return typeof backup?.key === 'string' && validStamp.test(backup.key) && isSavedProject(backup, id) &&
    typeof backup.savedAt === 'string' && Number.isFinite(Date.parse(backup.savedAt));
}

function importedBackups(backups, id) {
  if (backups === undefined) return [];
  if (!Array.isArray(backups) || backups.length > maxBackups) fail(400, '工程恢复点格式无效');
  const seen = new Set();
  for (const backup of backups) {
    if (!isBackup(backup, id) || seen.has(backup.key)) fail(400, '工程恢复点格式无效');
    if (Buffer.byteLength(JSON.stringify(backup.project)) > maxProject) fail(413, '工程恢复点超过大小限制');
    seen.add(backup.key);
  }
  return backups.map(({ key, revision, updatedAt, savedAt, project }) => ({ key, revision, updatedAt, savedAt, project }))
    .sort((a,b) => b.key.localeCompare(a.key));
}

let portableSettings;
const portableBindings = new Map();
let portableKeys = new Map();

function requirePortable() {
  if (!portable) fail(404, '此功能仅用于便携版');
}

async function getPortableSettings() {
  portableSettings ??= readJson(portableSettingsPath).catch(error => {
    console.warn('无法读取便携工程设置', error.message);
    return null;
  }).then(settings => {
    const savedPath = value => typeof value === 'string' && value ? resolve(data, value) : null;
    return {
      folder:savedPath(settings?.folder) ?? projects,
      recent:savedPath(settings?.recent),
    };
  });
  return portableSettings;
}

async function writePortableSettings(settings) {
  const storePath = path => {
    if (!path) return null;
    const fromData = relative(data, path);
    return isAbsolute(fromData) || fromData === '..' || fromData.startsWith('../') ||
      fromData.startsWith('..\\') ? path : fromData || '.';
  };
  await atomicWrite(portableSettingsPath, { folder:storePath(settings.folder), recent:storePath(settings.recent) });
  portableSettings = Promise.resolve(settings);
}

export async function getPortableProjectFolder() {
  requirePortable();
  return (await getPortableSettings()).folder;
}

export async function pickPortableProjectFolder(path) {
  requirePortable();
  if (typeof path !== 'string' || !isAbsolute(path)) fail(400, '请选择有效的工程文件夹');
  return serialized(async () => {
    if (!(await stat(path).catch(() => null))?.isDirectory()) fail(400, '无法访问所选的工程文件夹');
    const folder = await realpath(path);
    await writePortableSettings({ ...await getPortableSettings(), folder });
    portableKeys = new Map();
    return folder;
  });
}

async function portableFileInfo(path) {
  return lstat(path).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
}

async function readPortableEntry(path) {
  const info = await portableFileInfo(path);
  if (!info) return null;
  if (!info.isFile()) fail(400, '所选路径不是普通的工程文件');
  if (info.size > maxProjectFile) fail(413, '工程文件超过大小限制');
  const bytes = await readFile(path);
  if (bytes.length > maxProjectFile) fail(413, '工程文件超过大小限制');
  let raw;
  try { raw = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); }
  catch { fail(400, '无法读取工程文件，请选择有效的 .nac 或 .nac.json 文件'); }
  if (!raw || typeof raw !== 'object') fail(400, '工程文件格式无效');

  const digest = fingerprint(bytes);
  const wrapped = raw.project !== undefined;
  let file;
  if (raw.format !== undefined) {
    if (raw.format !== PROJECT_FILE_FORMAT || raw.version !== PROJECT_FILE_VERSION ||
        typeof raw.project?.id !== 'string' || !validId.test(raw.project.id) || !isSavedProject(raw, raw.project.id) ||
        !Array.isArray(raw.backups)) fail(400, '工程文件版本或格式不受支持');
    file = projectFile(currentSnapshot(raw), importedBackups(raw.backups, raw.project.id));
  } else {
    const source = wrapped ? raw.project : raw;
    if (source?.schema !== 1) fail(400, '工程文件格式无效');
    const id = typeof source.id === 'string' && validId.test(source.id) ? source.id
      : 'legacy-' + fingerprint(path).slice(0, 32);
    const project = { ...source, id,
      name:typeof source.name === 'string' ? source.name : basename(path).replace(portableExtension, '') };
    if (!isProject(project, id)) fail(400, '工程文件格式无效');
    const revision = wrapped && Number.isSafeInteger(raw.revision) && raw.revision > 0 ? raw.revision : 1;
    const updatedAt = wrapped && typeof raw.updatedAt === 'string' && Number.isFinite(Date.parse(raw.updatedAt))
      ? raw.updatedAt : info.mtime.toISOString();
    const operationHistory = wrapped ? normalizeOperationHistory(raw.operationHistory) : null;
    file = projectFile({ project, revision, updatedAt, ...(operationHistory && { operationHistory }) },
      importedBackups(wrapped ? raw.backups : undefined, id));
  }
  return { path, file, digest };
}

async function bindPortableEntry(entry) {
  portableBindings.set(entry.file.project.id, { path:entry.path, digest:entry.digest });
  const settings = await getPortableSettings();
  if (settings.recent === entry.path) return;
  try { await writePortableSettings({ ...settings, recent:entry.path }); }
  catch (error) { console.warn('无法记录最近打开的工程', error.message); }
}

async function openPortableEntry(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || !portableExtension.test(path)) {
    fail(400, '请选择 .nac 或 .nac.json 工程文件');
  }
  const entry = await readPortableEntry(path);
  if (!entry) fail(404, '找不到所选工程文件');
  await bindPortableEntry(entry);
  return { ...currentSnapshot(entry.file), path:entry.path };
}

export async function openPortableProjectFile(path) {
  requirePortable();
  return serialized(() => openPortableEntry(path));
}

export async function openPortableProjectKey(key) {
  requirePortable();
  return serialized(() => {
    const path = portableKeys.get(key);
    if (!path) fail(404, '此工程已不在列表中，请刷新工程文件夹');
    return openPortableEntry(path);
  });
}

async function* portableWorkspaceEntries() {
  const folder = await getPortableProjectFolder();
  if (folder === projects) await mkdir(folder, { recursive:true });
  const files = await readdir(folder, { withFileTypes:true }).catch(error => {
    if (['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(error.code)) fail(404, '工程文件夹不可访问，请重新选择');
    throw error;
  });
  for (const file of files) {
    if (!file.isFile() || !portableExtension.test(file.name)) continue;
    try {
      const entry = await readPortableEntry(join(folder, file.name));
      if (entry) yield entry;
    } catch (error) {
      console.warn('无法读取便携工程', file.name, error.message);
    }
  }
}

async function listPortableProjects() {
  const keys = new Map();
  const rows = [];
  for await (const { path, file } of portableWorkspaceEntries()) {
    const fileKey = fingerprint(path);
    keys.set(fileKey, path);
    rows.push({ id:file.project.id, name:file.project.name, updatedAt:file.updatedAt, fileKey });
  }
  portableKeys = keys;
  return rows.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
}

function portableProjectChanged() {
  fail(409, '原工程文件已在外部修改、移动或删除。请重新打开文件后再保存。');
}

async function portableEntryById(id) {
  const bound = portableBindings.get(id);
  if (bound) {
    let entry;
    try { entry = await readPortableEntry(bound.path); }
    catch (error) {
      if (error.status) portableProjectChanged();
      throw error;
    }
    if (entry?.file.project.id !== id) portableProjectChanged();
    return entry;
  }
  const { recent } = await getPortableSettings();
  if (recent && portableExtension.test(recent)) {
    const entry = await readPortableEntry(recent).catch(() => null);
    if (entry?.file.project.id === id) {
      await bindPortableEntry(entry);
      return entry;
    }
  }
  let match;
  for await (const entry of portableWorkspaceEntries()) {
    if (entry.file.project.id !== id) continue;
    if (match) fail(409, '存在多个同源工程，请从工程文件夹列表选择具体文件');
    match = entry;
  }
  if (match) await bindPortableEntry(match);
  return match;
}

async function newPortableProjectPath(project) {
  const folder = await getPortableProjectFolder();
  let name = Array.from(project.name).slice(0, 70).join('')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/[. ]+$/, '') || '未命名工程';
  if (/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)) name = '_' + name;
  let path = join(folder, name + '.nac');
  for (let suffix = 2; await portableFileInfo(path); suffix++) path = join(folder, name + ' (' + suffix + ').nac');
  return path;
}

async function verifyPortableTarget(path, expected) {
  const info = await portableFileInfo(path);
  if (!expected) {
    if (info) fail(409, '此文件名刚被占用，请再次保存');
    return;
  }
  if (!info?.isFile() || info.size > maxProjectFile) portableProjectChanged();
  const contents = await readFile(path).catch(error => {
    if (error.code === 'ENOENT') portableProjectChanged();
    throw error;
  });
  if (fingerprint(contents) !== expected) portableProjectChanged();
}

async function readLegacyBackups(dir, id) {
  const folder = join(dir, '备份');
  const files = await readdir(folder, { withFileTypes:true }).catch(err => {
    if (err.code === 'ENOENT') return [];
    throw err;
  });
  const keys = files.filter(file => file.isFile() && file.name.endsWith('.json'))
    .map(file => file.name.slice(0, -5)).filter(key => validStamp.test(key)).sort().reverse();
  const backups = [];
  for (const key of keys) {
    try {
      const backup = { ...await readJson(join(folder, `${key}.json`)), key };
      if (isBackup(backup, id)) backups.push(backup);
      if (backups.length === maxBackups) break;
    } catch (error) {
      console.warn('无法读取旧工程恢复点', key, error.message);
    }
  }
  return backups;
}

async function archiveLegacyProject(id) {
  const directory = join(projects, id);
  try {
    if (!(await lstat(directory)).isDirectory()) return;
    await mkdir(legacyProjects, { recursive:true });
    await rename(directory, join(legacyProjects, `${id}-${randomUUID()}`));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('旧工程原件未移入归档', id, error.message);
  }
}

async function readProject(id) {
  const path = projectPath(id);
  const file = await readJson(path, missingProject);
  if (file !== missingProject) {
    if (file?.format !== PROJECT_FILE_FORMAT || file.version !== PROJECT_FILE_VERSION ||
        !isSavedProject(file, id) || !Array.isArray(file.backups)) fail(500, '这个工程文件的格式无法读取');
    await archiveLegacyProject(id);
    return file;
  }
  const oldDir = join(projects, id);
  const previous = await readJson(join(oldDir, '工程.nac.json'));
  if (!previous) return null;
  if (!isSavedProject(previous, id)) fail(500, '这个旧工程的格式无法读取');
  const migrated = projectFile(currentSnapshot(previous), await readLegacyBackups(oldDir, id));
  await atomicWrite(path, migrated);
  // Move the original only after the standalone file is safely in place.
  await archiveLegacyProject(id);
  return migrated;
}

async function listProjects() {
  await mkdir(projects, { recursive:true });
  const files = await readdir(projects, { withFileTypes:true });
  const ids = new Set();
  for (const file of files) {
    if (file.isFile()) {
      const match = projectFilePattern.exec(file.name);
      if (match) ids.add(match[1]);
    } else if (file.isDirectory() && validId.test(file.name)) ids.add(file.name);
  }
  const rows = [];
  for (const id of ids) {
    try {
      const saved = await serialized(() => readProject(id));
      if (saved) rows.push({ id, name:saved.project.name, updatedAt:saved.updatedAt });
    } catch (error) {
      console.warn('无法读取工程', id, error.message);
    }
  }
  return rows.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function save(id, payload) {
  const project = payload?.project;
  if (!isProject(project, id)) fail(400, '工程格式无效');
  if (Buffer.byteLength(JSON.stringify(project)) > maxProject) fail(413, '工程超过大小限制');
  const operationHistory = normalizeOperationHistory(payload.operationHistory);
  if (payload.operationHistory != null && !operationHistory) fail(400, '操作历史格式无效');
  if (operationHistory && Buffer.byteLength(JSON.stringify(operationHistory)) > HISTORY_BYTES + 4096) fail(413, '操作历史超过大小限制');
  const portableEntry = portable ? await portableEntryById(id) : null;
  if (portableEntry && portableEntry.digest !== portableBindings.get(id).digest) portableProjectChanged();
  const previous = portable ? portableEntry?.file : await readProject(id);
  if ((previous?.revision || 0) !== payload.revision) fail(409, '这个工程已在另一个窗口中保存。请先重新打开工程。');
  if (previous && payload.backups !== undefined) fail(400, '已有工程的恢复点由软件保存');
  const now = new Date();
  const updated = { revision:(previous?.revision || 0) + 1, updatedAt:now.toISOString(), project,
    ...(operationHistory&&{operationHistory}) };
  let backups = previous?.backups ?? importedBackups(payload.backups, id);
  if (previous) {
    const last = backups[0];
    if (payload.checkpoint || !last || now - Date.parse(last.savedAt) >= 60_000) {
      const key = `${now.toISOString().replace(/[-:.]/g, '')}-${randomUUID().slice(0, 8)}`;
      const backup = { key, revision:previous.revision, updatedAt:previous.updatedAt,
        project:previous.project, savedAt:now.toISOString() };
      backups = [backup, ...backups].slice(0, maxBackups);
    }
  }
  const archive = projectFile(updated, backups);
  if (portable) {
    const path = portableEntry?.path ?? await newPortableProjectPath(project);
    const contents = await atomicWrite(path, archive, {
      createDirectory:false, beforeCommit:() => verifyPortableTarget(path, portableEntry?.digest),
    });
    await bindPortableEntry({ file:archive, path, digest:fingerprint(contents) });
    return { ...updated, path };
  }
  await atomicWrite(projectPath(id), archive);
  return updated;
}

async function api(req, origin, path) {
  const requestOrigin = req.headers.get('origin');
  if (req.headers.get('sec-fetch-site') === 'cross-site' || (requestOrigin && requestOrigin !== origin)) fail(403, '只允许从本软件访问本地工程');
  const get = req.method === 'GET';
  const put = req.method === 'PUT';
  if (get && path === '/api/status') {
    const status = { name:'nac-route-studio', data, build };
    if (portable) status.projects = await getPortableProjectFolder();
    return json(200, status);
  }
  if (get && path === '/api/projects') return json(200, portable ? await serialized(listPortableProjects) : await listProjects());
  if (path === '/api/catalog') {
    const file = dataEntry('user-catalog.json', '用户数据.json');
    if (get) return json(200, await readJson(file));
    if (put) {
      const value = await body(req, maxCatalog);
      if (!value || typeof value !== 'object' || !['items','recipes','modules'].some(key => Array.isArray(value[key]))) fail(400, '数据包没有物品、结构或配方记录');
      await serialized(() => atomicWrite(file, value));
      return json(200, { ok:true });
    }
  }
  const [, , collection, id, action, stamp, ...rest] = path.split('/');
  if (collection !== 'projects' || !validId.test(id || '') || rest.length) fail(404, '未找到此功能');
  if (get && (!action || action === 'file' && !stamp || action === 'backups')) {
    const entry = portable ? await serialized(() => portableEntryById(id)) : null;
    const saved = portable ? entry?.file : await serialized(() => readProject(id));
    if (!saved) fail(404, '未找到此工程');
    if (action === 'file') return json(200, saved);
    if (action === 'backups') {
      if (stamp) {
        const backup = saved.backups.find(entry => entry.key === stamp);
        if (!backup) fail(404, '未找到这份备份');
        return json(200, backup);
      }
      return json(200, saved.backups.map(backup => ({
        key:backup.key, savedAt:backup.savedAt, updatedAt:backup.updatedAt, name:backup.project.name,
      })));
    }
    return json(200, entry ? { ...currentSnapshot(saved), path:entry.path } : currentSnapshot(saved));
  }
  if (!action && put) {
    const payload = await body(req, maxProjectFile);
    return json(200, await serialized(() => save(id, payload)));
  }
  fail(404, '未找到此功能');
}

function within(base, pathname) {
  const path = resolve(base, pathname);
  const local = relative(base, path);
  if (!local || local.startsWith('..') || isAbsolute(local) || local.includes(':')) fail(404, '未找到文件');
  return path;
}

async function handle(req, origin) {
  const url = new URL(req.url);
  if (url.origin !== origin) fail(403, '请使用启动器打开本软件');
  const path = decodeURIComponent(url.pathname);
  if (path.startsWith('/api/')) return api(req, origin, path);
  if (!['GET', 'HEAD'].includes(req.method)) fail(405, '无效的请求');
  let file;
  if (path === '/') file = join(root, 'public', 'index.html');
  else if (path.startsWith('/src/')) file = within(join(root, 'src'), path.slice(5));
  else if (path.startsWith('/data/user-nei/')) {
    const name = path.slice('/data/user-nei/'.length);
    if (!/^[a-f0-9]{64}\.png$/.test(name)) fail(404, '未找到物品图标');
    file = join(data, 'NEI物品图标', name);
    if (!(await stat(file).catch(() => null))?.isFile()) file = join(root, 'public', 'data', 'user-nei', name);
  }
  else file = within(join(root, 'public'), path.slice(1));
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) fail(404, '未找到文件');
  const stream = req.method === 'HEAD' ? null : Readable.toWeb(createReadStream(file));
  return new Response(stream, { headers:{
    ...pageHeaders, 'Content-Type':contentTypes[extname(file)] || 'application/octet-stream',
    'Content-Length':String(info.size), 'Cache-Control':'no-cache',
  } });
}

function errorResponse(error) {
  if (!error.status) console.error(error);
  return json(error.status || 500, { error:error.status ? error.message : '本地文件操作失败，请检查工程目录权限' });
}

export async function respond(req, origin) {
  try { return await handle(req, origin); }
  catch (error) { return errorResponse(error); }
}

async function openWindow() {
  const edge = join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  const chrome = join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe');
  for (const browser of [edge, chrome]) {
    if (process.platform !== 'win32' || !(await stat(browser).catch(() => null))) continue;
    spawn(browser, [`--app=${applicationUrl()}`, '--no-first-run', '--start-maximized', `--user-data-dir=${join(data,'界面配置')}`], { detached:true, stdio:'ignore', windowsHide:true }).unref();
    return;
  }
  if (process.platform === 'win32') spawn('rundll32.exe', ['url.dll,FileProtocolHandler', applicationUrl()], { detached:true, stdio:'ignore', windowsHide:true }).unref();
}

async function writeHttpResponse(req, res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (req.method === 'HEAD' || !response.body) {
    await response.body?.cancel();
    res.end();
    return;
  }
  const stream = Readable.fromWeb(response.body);
  res.once('close', () => stream.destroy());
  stream.on('error', () => res.destroy()).pipe(res);
}

export function startHttpServer({ showWindow = false, onFatal = () => { process.exitCode = 1; } } = {}) {
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.host !== `${host}:${port}` && req.headers.host !== `localhost:${port}`) fail(403, '请使用启动器打开本软件');
      const origin = applicationUrl();
      const options = { method:req.method, headers:req.headers };
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        options.body = Readable.toWeb(req);
        options.duplex = 'half';
      }
      const request = new Request(new URL(req.url, origin), options);
      await writeHttpResponse(req, res, await respond(request, origin));
    } catch (error) {
      if (res.headersSent) res.destroy();
      else await writeHttpResponse(req, res, errorResponse(error));
    }
  });
  server.on('error', async error => {
    if (error.code === 'EADDRINUSE') {
      if (showWindow) {
        const status = await fetch(`${applicationUrl()}/api/status`, { signal:AbortSignal.timeout(2000) }).then(r => r.json()).catch(() => null);
        if (status?.name === 'nac-route-studio' && status.data === data && (status.build ?? null) === build) {
          await openWindow();
          return;
        }
      }
      if (build && !explicitPort && port < firstPort + 12) {
        port++;
        server.listen(port, host);
        return;
      }
    }
    console.error(error);
    onFatal();
  });
  server.on('listening', () => {
    port = server.address().port;
    console.log(`NAC 路由设计工作室  ${applicationUrl()}\n工程目录  ${data}`);
    if (showWindow) void openWindow();
  });
  return server.listen(port, host);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startHttpServer({ showWindow:process.argv.includes('--open') });
}
