import { HISTORY_BYTES, normalizeOperationHistory } from './operation-history.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project.js';

const databaseName = 'nac-route-studio';
const maxProjectBytes = 8 * 1024 * 1024;
const maxCatalogBytes = 80 * 1024 * 1024;
const maxBackups = 30;
const validId = /^[a-zA-Z0-9_-]{1,80}$/;
const validBackupKey = /^\d{8}T\d{9}Z-[a-f0-9]{8}$/;
const encoder = new TextEncoder();
let connection;

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function storageError(error) {
  if (error?.name === 'QuotaExceededError') {
    return new Error('浏览器存储空间不足。请保存本地工程文件。', { cause:error });
  }
  return new Error('无法访问浏览器工程库。请检查浏览器的存储权限。', { cause:error });
}

function database() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('projects', { keyPath:'id' });
      request.result.createObjectStore('settings');
    };
    request.onsuccess = () => {
      const db = request.result;
      const close = () => { db.close(); connection = undefined; };
      db.onversionchange = close;
      db.onclose = close;
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).catch(error => {
    connection = undefined;
    throw storageError(error);
  });
  return connection;
}

// The read and subsequent put belong to the same transaction. Queue the put
// from the request callback so the transaction cannot close between them.
async function transaction(name, mode, run) {
  const db = await database();
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(name, mode); }
    catch (error) { reject(storageError(error)); return; }
    let result, cause;
    const checked = callback => {
      try { result = callback(); }
      catch (error) { cause = error; tx.abort(); }
    };
    const receive = (request, callback) => {
      request.onsuccess = () => checked(() => callback(request.result));
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(cause ?? storageError(tx.error));
    checked(() => run(tx.objectStore(name), receive));
  });
}

function isProject(project, id) {
  return project?.id === id && project.schema === 1 && typeof project.name === 'string' &&
    Array.isArray(project.modules) && project.modules.length === 12 &&
    Array.isArray(project.ports) && Array.isArray(project.routes) && Array.isArray(project.circuits);
}

function checkSize(value, limit, message) {
  if (encoder.encode(JSON.stringify(value)).byteLength > limit) fail(413, message);
}

function checkProject(project, id) {
  if (!isProject(project, id)) fail(400, '工程格式无效');
  checkSize(project, maxProjectBytes, '工程超过大小限制');
}

function checkHistory(history) {
  if (history == null) return null;
  const value = normalizeOperationHistory(history);
  if (!value) fail(400, '操作历史格式无效');
  checkSize(value, HISTORY_BYTES + 4096, '操作历史超过大小限制');
  return value;
}

const isTimestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isRevision = value => Number.isSafeInteger(value) && value > 0;

function checkBackups(backups, id) {
  if (!Array.isArray(backups) || backups.length > maxBackups) fail(400, '工程恢复点格式无效');
  const seen = new Set();
  const normalized = backups.map(backup => {
    const { key, revision, updatedAt, savedAt, project } = backup ?? {};
    if (typeof key !== 'string' || !validBackupKey.test(key) || seen.has(key) || !isRevision(revision) ||
        !isTimestamp(updatedAt) || !isTimestamp(savedAt) || !isProject(project, id)) {
      fail(400, '工程恢复点格式无效');
    }
    seen.add(key);
    checkSize(project, maxProjectBytes, '工程恢复点超过大小限制');
    return { key, revision, updatedAt, savedAt, project };
  });
  return normalized.sort((a,b) => b.key.localeCompare(a.key));
}

function projectFile(snapshot, backups) {
  return { format:PROJECT_FILE_FORMAT, version:PROJECT_FILE_VERSION, ...snapshot, backups };
}

function snapshot(file) {
  const { revision, updatedAt, project, operationHistory } = file;
  return { revision, updatedAt, project, ...(operationHistory && { operationHistory }) };
}

function save(id, data) {
  const { project, revision, checkpoint, operationHistory, backups } = data ?? {};
  checkProject(project, id);
  const journal = checkHistory(operationHistory);
  const incomingBackups = backups === undefined ? undefined : checkBackups(backups, id);
  const incoming = structuredClone({
    project, ...(journal && { operationHistory:journal }),
  });
  const restoredBackups = incomingBackups && structuredClone(incomingBackups);
  return transaction('projects', 'readwrite', (store, receive) => {
    receive(store.get(id), record => {
      const previous = record?.file;
      if ((previous?.revision ?? 0) !== revision) {
        fail(409, '这个工程已在另一个窗口中保存。请先重新打开工程。');
      }
      if (previous && restoredBackups !== undefined) fail(400, '已有工程的恢复点由软件保存');
      const now = new Date();
      const updatedAt = now.toISOString();
      const current = { ...incoming, revision:revision+1, updatedAt };
      let points = previous?.backups ?? restoredBackups ?? [];
      const last = points[0];
      if (previous && (checkpoint || !last || now - Date.parse(last.savedAt) >= 60_000)) {
        const key = `${updatedAt.replace(/[-:.]/g, '')}-${crypto.randomUUID().slice(0, 8)}`;
        const backup = { key, revision:previous.revision, updatedAt:previous.updatedAt,
          project:previous.project, savedAt:updatedAt };
        points = [backup, ...points].slice(0, maxBackups);
      }
      store.put({ id, file:projectFile(current, points), attachment:record?.attachment ?? null });
      return current;
    });
  });
}

function listProjects() {
  const rows = [];
  return transaction('projects', 'readonly', (store, receive) => {
    receive(store.openCursor(), cursor => {
      if (cursor) {
        const { id, file } = cursor.value;
        rows.push({ id, name:file.project.name, updatedAt:file.updatedAt });
        cursor.continue();
      } else {
        return rows.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
      }
    });
  });
}

function readProject(id, action, key) {
  return transaction('projects', 'readonly', (store, receive) => {
    receive(store.get(id), record => {
      if (!record) fail(404, '未找到此工程');
      const { file } = record;
      if (action === 'file') return file;
      if (action !== 'backups') return snapshot(file);
      if (key) {
        const backup = file.backups.find(entry => entry.key === key);
        if (!backup) fail(404, '未找到这份备份');
        return backup;
      }
      return file.backups.map(backup => ({
        key:backup.key, savedAt:backup.savedAt, updatedAt:backup.updatedAt, name:backup.project.name,
      }));
    });
  });
}

export async function webApi(path, data) {
  const get = data === undefined;
  if (get && path === '/api/status') {
    await database();
    return { name:'nac-route-studio', data:'当前浏览器', build:'web' };
  }
  if (path === '/api/catalog') {
    if (get) return transaction('settings', 'readonly', (store, receive) => {
      receive(store.get('catalog'), catalog => catalog ?? null);
    });
    if (!data || !['items','recipes','modules'].some(key => Array.isArray(data[key]))) {
      fail(400, '数据包没有物品、结构或配方记录');
    }
    checkSize(data, maxCatalogBytes, '数据包超过大小限制');
    const catalog = structuredClone(data);
    return transaction('settings', 'readwrite', store => {
      store.put(catalog, 'catalog');
      return { ok:true };
    });
  }
  if (get && path === '/api/projects') return listProjects();
  const match = /^\/api\/projects\/([a-zA-Z0-9_-]{1,80})(?:\/(file|backups)(?:\/([^/]+))?)?$/.exec(path);
  if (!match) fail(404, '未找到此功能');
  const [, id, action, key] = match;
  if (get && !(action === 'file' && key)) return readProject(id, action, key);
  if (!get && !action) return save(id, data);
  fail(404, '未找到此功能');
}

// A selected file replaces the browser cache under the original project ID.
// A newer local revision invalidates pending writes in another tab.
export async function replaceWebProject(document, attachment) {
  const { format, version, project, operationHistory, backups, revision = 1,
    updatedAt = new Date().toISOString() } = document ?? {};
  const id = project?.id;
  if (format !== PROJECT_FILE_FORMAT || version !== PROJECT_FILE_VERSION ||
      typeof id !== 'string' || !validId.test(id) || !isRevision(revision) || !isTimestamp(updatedAt)) {
    fail(400, '工程文件版本或格式不受支持。');
  }
  checkProject(project, id);
  const journal = checkHistory(operationHistory);
  const incoming = structuredClone(projectFile({
    revision, updatedAt, project, ...(journal && { operationHistory:journal }),
  }, checkBackups(backups, id)));
  return transaction('projects', 'readwrite', (store, receive) => {
    receive(store.get(id), record => {
      incoming.revision = Math.max(revision, (record?.file.revision ?? 0)+1);
      const linked = attachment === undefined ? record?.attachment :
        attachment && { ...attachment, revision:incoming.revision };
      store.put({ id, file:incoming, attachment:linked ?? null });
      return incoming;
    });
  });
}

export async function getWebProjectFile(id) {
  if (typeof id !== 'string' || !validId.test(id)) return null;
  return transaction('projects', 'readonly', (store, receive) => {
    receive(store.get(id), record => record?.attachment ?? null);
  });
}

export async function storeWebProjectFile(id, attachment) {
  if (typeof id !== 'string' || !validId.test(id)) fail(404, '未找到此工程');
  const linked = attachment ?? null;
  return transaction('projects', 'readwrite', (store, receive) => {
    receive(store.get(id), record => {
      if (!record) fail(404, '未找到此工程');
      store.put({ ...record, attachment:linked });
      return linked;
    });
  });
}
