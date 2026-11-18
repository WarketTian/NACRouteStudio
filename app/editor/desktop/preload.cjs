const { contextBridge, ipcRenderer } = require('electron');

const portable = process.argv.includes('--nac-portable');
const desktop = {
  portable,
  setTheme: theme => ipcRenderer.send('nac:theme', theme),
  onCloseRequest: callback => {
    ipcRenderer.on('nac:close-request', () => callback());
  },
  closeResult: saved => ipcRenderer.send('nac:close-result', saved === true),
};

async function portableCall(action, ...args) {
  const { error, value } = await ipcRenderer.invoke(`nac:portable-${action}`, ...args);
  if (error) throw Error(error);
  return value;
}

if (portable) Object.assign(desktop, {
  pickProject: () => portableCall('pick-project'),
  openProject: key => portableCall('open-project', key),
  pickProjectFolder: () => portableCall('pick-folder'),
  onProjectLaunch: callback => { ipcRenderer.on('nac:portable-launch', (_event, key) => callback(key)); },
  readyForProjects: () => portableCall('ready'),
});

contextBridge.exposeInMainWorld('nacDesktop', desktop);
