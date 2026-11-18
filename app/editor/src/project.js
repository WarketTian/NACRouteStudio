import { getLegacyPortPosition, getPortPosition } from './diagram.js';
import { migrateOperationHistory } from './operation-history.js';

export const SIZE = 7;
export const CORE = -1;
export const MAX_LAYERS = 4;
export const GRID_LAYOUT = 2;
export const PROJECT_FILE_FORMAT = 'nac-project';
export const PROJECT_FILE_VERSION = 1;
export const isLegacyGridLayout = value => value==null || value===0 || value===1;
// The upper-right slot is 01. Keep storage indices stable for existing drawings.
export const DISPLAY_SLOTS = Object.freeze([1,2,3,4,5,6,7,8,9,10,11,0]);
export const slotLabel = slot => {
  const index=DISPLAY_SLOTS.indexOf(slot);
  return index<0?'':String(index+1).padStart(2,'0');
};
export const directions = { n:'北 ↑', e:'东 →', s:'南 ↓', w:'西 ←', up:'朝上 ⊙', down:'朝下 ⊗' };
export const kinds = { feed:'原料输入', in:'真空传送输入端口', out:'真空传送输出端口', final:'成品回收' };
export const voltageTiers = ['ULV','LV','MV','HV','EV','IV','LuV','ZPM','UV','UHV','UEV','UIV','UMV','UXV','MAX'];
export const formatNumber = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-CN', { maximumFractionDigits:4 }) : '—';
export const makeId = () => crypto.randomUUID();
export const makeModule = type => ({ type, rotation:0, ignoreMaterials:false, isolate:false, waterTier:null, casingTier:null, fluid:null, config:{}, rules:[] });
export const makeRule = () => ({ mode:'items', inputs:[], items:[], outputs:[], redstone:{ channel:0,level:0 } });

export function blankProject(name = '未命名工程') {
  return { schema:1, gridLayout:GRID_LAYOUT, id:makeId(), name, modules:Array(12).fill(null), ports:[], routes:[], circuits:[],
    power:{ mode:'eu', eu:null, amps:null, tier:'UEV', ratio:25, calibration:0 }, notes:'' };
}

function alignLegacyBends(route, ports, layout) {
  const last=route.bends.length-1;
  if (!route.manual||last<0) return;
  // The end stubs follow their cells; keep the user's interior and loose-end coordinates.
  const first=route.bends[0], end=route.bends[last];
  const terminal=(id,bend)=>{
    const port=ports.get(id);
    if (!port) return {};
    const before=getLegacyPortPosition(port,layout);
    const after=getPortPosition(port);
    const patch={};
    for (const [fixed,along] of [['x','y'],['y','x']]) {
      if (bend[fixed]!==before[fixed]) continue;
      patch[fixed]=after[fixed];
      const lead=bend[along]-before[along];
      // Keep the old exit direction when the relocated port passes the old bend.
      if (lead && (bend[along]-after[along])*lead<=0) patch[along]=after[along]+lead;
    }
    return patch;
  };
  const startPatch=terminal(route.from,first), endPatch=terminal(route.to,end);
  if (last===0) {
    if (['x','y'].some(axis=>axis in startPatch&&axis in endPatch&&startPatch[axis]!==endPatch[axis])) {
      route.bends=[{...first,...startPatch},{...first,...endPatch}];
    } else route.bends[0]={...first,...startPatch,...endPatch};
    return;
  }
  route.bends[0]={...first,...startPatch};
  route.bends[last]={...end,...endPatch};
}

export function prepareProject(raw, { copy = false } = {}) {
  if (raw?.project) raw = raw.project;
  if (raw?.schema !== 1 || !Array.isArray(raw.modules) || raw.modules.length !== 12 ||
      !Array.isArray(raw.ports) || !Array.isArray(raw.routes) || !Array.isArray(raw.circuits)) {
    throw Error('工程文件格式不符合 NAC 路由设计工作室的规范');
  }
  const defaults = blankProject();
  const source = structuredClone(raw);
  const usedIds = new Set();
  source.ports = source.ports.filter(port => {
    if (!port || typeof port.id !== 'string' || usedIds.has(port.id) || !Object.hasOwn(kinds, port.kind) ||
        !Number.isInteger(port.slot) || port.slot < -1 || port.slot > 11 || (port.slot >= 0 && !source.modules[port.slot]) ||
        ![port.x,port.y].every(value => Number.isInteger(value) && value >= 0 && value < SIZE)) return false;
    usedIds.add(port.id);
    port.items = Array.isArray(port.items) ? port.items.filter(entry => typeof entry?.item === 'string') : [];
    port.facing = Object.hasOwn(directions, port.facing) ? port.facing : 'down';
    port.color = Number.isInteger(port.color) && port.color >= 0 && port.color <= 15 ? port.color : 15;
    if (port.locked!==true) delete port.locked;
    return true;
  });
  const legacyPorts=isLegacyGridLayout(source.gridLayout)
    ? new Map(source.ports.map(port=>[port.id,port])) : null;
  const point = value => Number.isFinite(value?.x) && Number.isFinite(value?.y);
  const usedRoutes = new Set();
  source.routes = source.routes.filter(route => {
    if (!route || typeof route.id !== 'string' || usedRoutes.has(route.id) || !usedIds.has(route.from) ||
        !(usedIds.has(route.to) || route.to == null && point(route.looseEnd))) return false;
    usedRoutes.add(route.id);
    route.layer = Number.isInteger(route.layer) ? Math.min(MAX_LAYERS-1,Math.max(0,route.layer)) : 0;
    route.bends = Array.isArray(route.bends) ? route.bends.filter(point) : [];
    if (legacyPorts) alignLegacyBends(route,legacyPorts,source.gridLayout);
    route.name = typeof route.name==='string' ? route.name.trim().slice(0,64) : '';
    route.locked = route.locked===true;
    route.hidden = route.hidden===true;
    if (!Number.isInteger(route.displayColor) || route.displayColor<0 || route.displayColor>15) delete route.displayColor;
    return true;
  });
  source.circuits = source.circuits.filter(circuit => typeof circuit?.item === 'string');
  return { ...defaults, ...source, gridLayout:legacyPorts?GRID_LAYOUT:source.gridLayout, id:copy ? defaults.id : source.id || defaults.id,
    name:String(source.name || defaults.name).slice(0, 100),
    modules:source.modules.map(module => typeof module?.type === 'string' ? { ...makeModule(module.type), ...module, rules:Array.isArray(module.rules) ? module.rules : [] } : null),
    power:{ ...defaults.power, ...source.power } };
}

export function prepareProjectImport(raw, { copy = true } = {}) {
  const portable = raw?.format === PROJECT_FILE_FORMAT;
  if (portable && (raw.version !== PROJECT_FILE_VERSION || !raw.project || !Array.isArray(raw.backups))) {
    throw Error('工程文件版本或格式不受支持。');
  }
  const source = raw?.project ?? raw;
  const project = prepareProject(source,{copy});
  const rebase = snapshot => prepareProject({ ...snapshot,id:project.id });
  const operationHistory = raw?.project && raw.operationHistory
    ? migrateOperationHistory(source,raw.operationHistory,rebase) : null;
  if (portable && raw.operationHistory != null && !operationHistory) {
    throw Error('工程文件中的操作历史无法读取。');
  }
  const backups = portable ? raw.backups.map(backup => ({
    key:backup?.key, revision:backup?.revision, updatedAt:backup?.updatedAt, savedAt:backup?.savedAt,
    project:rebase(backup?.project),
  })) : [];
  return { project, operationHistory, backups };
}

export function localProjectFile(project,operationHistory,backups) {
  return {
    format:PROJECT_FILE_FORMAT, version:PROJECT_FILE_VERSION, revision:1, updatedAt:new Date().toISOString(),
    project, operationHistory, backups,
  };
}

export function mergeCatalog(base, extra) {
  if (!extra) return base;
  const merged = { ...base, ...extra };
  for (const key of ['items','modules','recipes']) {
    const map = new Map((base[key] || []).map(entry => [entry.id, entry]));
    for (const entry of Array.isArray(extra[key]) ? extra[key] : []) {
      if (entry && typeof entry.id === 'string') map.set(entry.id, { ...map.get(entry.id), ...entry });
    }
    merged[key] = [...map.values()];
  }
  const circuitId = value => typeof value === 'string' ? value : value?.item || value?.id;
  merged.circuits = [...new Map([...(base.circuits || []), ...(extra.circuits || [])].map(value => [circuitId(value), value])).values()];
  return merged;
}

export async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : {
    method:'PUT', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(data),
  });
  const payload = await response.json();
  if (!response.ok) throw Object.assign(Error(payload.error || '本地读取失败'),{ status:response.status });
  return payload;
}

export function projectFilename(name, extension='.nac.json') {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') + extension;
}

export function downloadProjectFile(blob,name,extension) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = projectFilename(name,extension);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
