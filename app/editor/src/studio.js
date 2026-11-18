import { BOARD_CENTER, BOARD_MIN, BOARD_MAX, BOARD_SIZE, CELL_SIZE, GRID_ORIGIN, DYE_COLORS, LAYER_STYLES, RETURN_STYLE, ROUTE_CUT_RADIUS, routeStrokeStyle, buildRoutes, getPlatform, getCell, getFootprint, getPortPosition, draftRoutePoints, roundedRoutePath, snapGridCoordinate, nearestRouteSegment, dragRouteSegment, routeCutouts, routeLabelPoint, chooseRouteColor, isCoreReturn } from './diagram.js';
import { api as desktopApi, blankProject, directions, DISPLAY_SLOTS, downloadProjectFile, formatNumber as fmt, isLegacyGridLayout, kinds, localProjectFile, makeId, makeModule, makeRule, mergeCatalog, prepareProject, prepareProjectImport, projectFilename, slotLabel, voltageTiers } from './project.js';
import { getWebProjectFile, replaceWebProject, storeWebProjectFile, webApi } from './web-storage.js';
import { createHtmlProject, HTML_PROJECT_HASH_PREFIX, htmlProjectFromHash, readHtmlProject } from './html-project.js';
import { readPreferences, shortcutDefaults, shortcutLabels, validateShortcut } from './preferences.js';
import { normalizedInputs, renderRecipeCard } from './recipe-view.js';
import { listModuleRecipes, portItemSuggestions, setModuleRecipe, splitterRuleSuggestions } from './module-recipes.js';
import { ROUTE_ARROW_PATH, routeArrow } from './route-direction.js';
import { findItemRecipes, generateFinalRecipes } from './final-recipes.js';
import { circuitTier, targetCircuitRows } from './circuit-tiers.js';
import { compileSearch, itemSearchFields } from './search.js';
import { adjacentWindowPosition, clampDockWidth, dockLimits, dockMaximum, workspaceDocks } from './workspace-layout.js';
import { createOperationHistory, HISTORY_LIMIT, migrateOperationHistory } from './operation-history.js';
import { DEFAULT_ARRANGE_WEIGHTS, normalizeArrangeWeights } from './arrange-weights.js';
import { isPortCell, reanchorPortBends, translatePortGroup } from './port-layout.js';
import { isInput, isOutput, matchingPortDyes } from './port-connection.js';
import { layoutModuleFluidBadges, selectedModuleFluids } from './module-fluids.js';
import { CALIBRATION_FAMILIES, calibrationFamily, calibrationLevel, calibrationSelection } from './calibration.js';
import { assemblyPowerMultiplier, biologicalFluidMultiplier, etchingDivisors, immersionDurationMultiplier, opticalWaterBoost, opticalWaterEffects, opticalWaterTiers } from './module-boosts.js';

const webEdition = document.documentElement.hasAttribute('data-web-edition');
const desktop = globalThis.nacDesktop;
const portableEdition = !webEdition && desktop?.portable === true;
function takeHtmlLaunchHash() {
  const hash = location.hash;
  if (!webEdition || !hash.startsWith(HTML_PROJECT_HASH_PREFIX)) return '';
  const address = new URL(location.href);
  address.hash = '';
  window.history.replaceState(window.history.state,'',address);
  return hash;
}
const launchHash = takeHtmlLaunchHash();
const projectAddressPrefix = '#project=';
const api = webEdition ? webApi : desktopApi;
const webAsset = path => webEdition ? `.${path}` : path;
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const tooltip = document.querySelector('#tooltip');
const notice = document.querySelector('#notice');
const contextMenu = document.querySelector('#context-menu');
const floatingWindows = document.querySelector('#floating-windows');
const emptyDataset = { items:[], modules:[], recipes:[], circuits:[] };
const icons = {
  add:'M12 5v14M5 12h14', folder:'M3 18V6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z',
  save:'M5 4h12l3 3v13H4V4h1Zm2 0v6h9V4M7 20v-7h10v7',
  history:'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v5l3 2', book:'M12 5c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v14',
  undo:'M9 6 4 11l5 5M4 11h10a6 6 0 0 1 6 6v2', redo:'m15 6 5 5-5 5m5-5H10a6 6 0 0 0-6 6v2',
  operations:'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  cable:'M7 18H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2M7 15l3 3-3 3M17 3l-3 3 3 3',
  pointer:'m5 3 4 17 3-7 7-3L5 3Z', hand:'M8 13.8 5.9 11.6a1.5 1.5 0 0 0-2.3 1.9l3.7 5.2a5.5 5.5 0 0 0 4.5 2.3h2.4a5 5 0 0 0 5-5V9.1a1.4 1.4 0 0 0-2.8 0V6.6a1.4 1.4 0 0 0-2.8 0V4.9a1.4 1.4 0 0 0-2.8 0v1.7a1.4 1.4 0 0 0-2.8 0ZM10.8 6.6v4.5m2.8-4.5v4.5m2.8-2v2',
  fit:'M9 4H4v5m11-5h5v5m0 6v5h-5M4 15v5h5', minus:'M5 12h14', close:'m6 6 12 12M18 6 6 18',
  search:'M16 16l4 4m-2-9a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z', check:'m5 12 4 4L19 6', power:'m13 2-8 12h6l-1 8 9-12h-6l1-8Z',
  box:'M4 7l8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4m-8 4v10', trash:'M4 6h16M9 6V3h6v3M6 6l1 14h10l1-14m-8 4v6m4-6v6',
  menu:'M4 6h16M4 12h16M4 18h16', arrow:'M4 12h15m-6-6 6 6-6 6', info:'M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  lock:'M7 11V7a5 5 0 0 1 10 0v4m-12 0h14v10H5z', unlock:'M7 11V7a5 5 0 0 1 9-3m-11 7h14v10H5z',
  edit:'M4 16v4h4L20 8l-4-4L4 16Zm10-10 4 4', target:'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm0-4a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-5h.01',
  settings:'M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4',
  upload:'M4 16v4h16v-4M12 16V4m-5 5 5-5 5 5', download:'M4 16v4h16v-4M12 4v12m-5-5 5 5 5-5',
  align:'M3 5h8v6h10M3 12h4v6h14m-8-5v4m4-12v5', collapse:'m14 6-6 6 6 6', expand:'m10 6 6 6-6 6',
  down:'m6 9 6 6 6-6', bookmark:'M6 4h12v16l-6-4-6 4z', fluid:'M12 3c3 4 6 7.2 6 11a6 6 0 1 1-12 0c0-3.8 3-7 6-11Z',
};
const icon = (name,size=16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="${icons[name] || icons.info}"/></svg>`;
const esc = (value='') => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const attr = esc;
const headingHint = tip => tip ? `data-tip-heading="${attr(tip)}" aria-description="${attr(tip)}" tabindex="0"` : '';
const button = (action, label, glyph, options={}) => `<button type="button" class="${options.class || ''}" data-action="${action}" ${options.data || ''} ${options.disabled ? 'disabled' : ''} title="${attr(options.tip || label)}" aria-label="${attr(options.tip || label)}">${glyph ? icon(glyph) : ''}${options.only ? '' : esc(label)}</button>`;
const select = (field,value,choices,options='') => `<select data-field="${field}" ${options}>${choices.map(([key,label]) => `<option value="${attr(key)}"${String(key)===String(value??'')?' selected':''}>${esc(label)}</option>`).join('')}</select>`;
const number = (field,value,range='',placeholder='') => `<input type="number" data-field="${field}" value="${attr(value)}" ${range} placeholder="${attr(placeholder)}">`;
const field = (label,html,tip='') => `<label class="field" title="${attr(tip)}"><span>${esc(label)}</span>${html}</label>`;
const toggle = (field,value,label,tip='') => `<label class="toggle" title="${attr(tip)}"><input type="checkbox" data-field="${field}" ${value?'checked':''}><span>${esc(label)}</span></label>`;
function urls(value) {
  if (typeof value !== 'string') return '';
  if (webEdition && value.startsWith('/data/')) return webAsset(value);
  if (webEdition && value.startsWith('./data/')) return value;
  return /^(?:\/(?!\/)|data:image\/(?:png|webp|jpeg);base64,)/.test(value) ? value : '';
}
const colors = DYE_COLORS.map((color,index) => [index,color.name]);
const waterChoices = [['','未设置'], ...Array.from({length:8},(_,i) => [i+1,`${i+1} 级净化水`])];
const voltageChoices = voltageTiers.map(tier => [tier,tier]);
function voltageSelect(field,value,placeholder,choices=voltageChoices) {
  const selected=String(value??'');
  const tier=choices.find(([key])=>String(key)===selected)?.[1];
  const options=[['',placeholder],...choices].map(([key,label])=>{
    const voltage=key===''?'':` data-voltage="${attr(label)}"`;
    return `<option value="${attr(key)}"${String(key)===selected?' selected':''}${voltage}><span class="voltage-label"${voltage}>${esc(label)}</span></option>`;
  });
  return `<select data-field="${field}" class="voltage-select"${tier?` data-voltage="${attr(tier)}"`:''}><button type="button"><selectedcontent></selectedcontent></button>${options.join('')}</select>`;
}
const coordinate = value => `(${value.x+1}, ${value.y+1})`;
const fitPadding = 24;
const canPlace = (slot,x,y) => (slot===-1||!!project.modules[slot])&&isPortCell(slot,x,y);

let builtin = emptyDataset;
let custom = null;
let dataset = emptyDataset;
let items = new Map();
let modules = new Map();
let recipes = new Map();
let circuits = [];
let engine = null;
let project = blankProject();
let operationHistory = createOperationHistory(project);
let revision = 0;
let dirty = false;
let saveTimer = null;
let saving = null;
let localOnly = false;
let localBackups = [];
let webProjectFile = null;
let webFileSaving = false;
let savedVersion = 0;
let version = 0;
let recipeVersion = 0;
let selection = { slot:null, x:null, y:null, port:null, route:null };
let portGroup = null;
let portDrag = null;
let tool = 'pointer';
let draft = null;
let routeDrag = null;
let routeGeometry = new Map();
let menuState = null;
let drawer = 'properties';
let targetsOpen = localStorage.getItem('nac.targetsOpen')==='true';
const bookmarks = readBookmarks();
const recipeTrail = [];
let rightCollapsed = localStorage.getItem('nac.rightCollapsed')==='true';
let rightWidth = Number(localStorage.getItem('nac.rightWidth'))||278;
let bookmarkWidth = Number(localStorage.getItem('nac.bookmarkWidth'))||Math.max(120,Math.min(168,innerWidth*.12));
let sidebarDrag = null;
let recipeDividerDrag = null;
let recipeListWidth = Number(localStorage.getItem('nac.recipeListWidth'))||0;
const structureWindows = new Map();
const portWindows = new Map();
const dialogLayouts = new Map();
let windowDrag = null;
let windowZ = 10;
let layer = 0;
let showLayers = new Set(LAYER_STYLES.map((_,index) => index));
let camera = { zoom:1, x:0, y:0 };
let issueFocus = null;
const moduleFluidVisibilityKey = 'nac.showModuleFluids';
let showModuleFluids = localStorage.getItem(moduleFluidVisibilityKey)==='true';
let moduleFluidBounds = null;
let dragPan = null;
let toolSpace = false;
let activeCircuit = 0;
let reports = new Map();
let modal = null;
let toastTimer = null;
let resultsTab = '验证';
let catalogQuery = '';
let catalogKind = 'all';
let catalogPage = 0;
let recipeQuery = '';
let recipeFilter = 'circuits';
let recipeTier = '';
let activeRecipe = '';
let ruleIndex = 0;
let rulePage = 'items';
let projectDirectory = '';
let portableProjectPath = '';
let portableProjectQueue = Promise.resolve();
let portableProjectBusy = false;
let portableBinding = false;
let startupWarning = '';
const preferences = readPreferences(localStorage);
const arrangeWeightKey = 'nac.arrangeWeights';
const arrangePortsKey = 'nac.arrangePorts';
let arrangeWeights = readArrangeWeights();
let arrangePorts = localStorage.getItem(arrangePortsKey)==='true';
const systemTheme = matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const theme=preferences.theme==='system' ? (systemTheme.matches?'dark':'light') : preferences.theme;
  document.documentElement.dataset.theme=theme;
  globalThis.nacDesktop?.setTheme(preferences.theme);
}
applyTheme();
systemTheme.addEventListener('change',applyTheme);
function savePreferences() { localStorage.setItem('nac.preferences',JSON.stringify(preferences)); }
function readArrangeWeights() {
  try { return normalizeArrangeWeights(JSON.parse(localStorage.getItem(arrangeWeightKey))); }
  catch { return {...DEFAULT_ARRANGE_WEIGHTS}; }
}

function dataIndex() {
  dataset = mergeCatalog(builtin,custom);
  items = new Map(dataset.items.map(item => [item.id,item]));
  modules = new Map(dataset.modules.map(module => [module.id,module]));
  recipes = new Map(dataset.recipes.map(recipe => [recipe.id,recipe]));
  const declared = (dataset.circuits || []).map(entry => typeof entry === 'string' ? entry : entry.item || entry.id);
  const inferred = dataset.items.filter(entry => entry.circuit || entry.category === 'circuit').map(entry => entry.id);
  circuits = [...new Set([...declared,...inferred])].filter(id => items.has(id));
}

const itemName = id => items.get(id)?.name || id || '未设置';
const itemIcon = item => urls(item?.animatedIcon)||urls(item?.icon);
const moduleName = id => modules.get(id)?.name || id || '未选择结构';
const slotName = slot => slot === -1 ? '主体控制室' : slot == null ? '工程' : `${slotLabel(slot)} · ${moduleName(project.modules[slot]?.type)}`;
const activePort = () => project.ports.find(port => port.id === selection.port);
const activeRoute = () => project.routes.find(route => route.id === selection.route);
const activeModule = () => project.modules[selection.slot];
const splitterSlot = () => modal?.slot;
const splitterModule = () => project.modules[splitterSlot()];
const routeEnds = route => [project.ports.find(port => port.id === route.from),project.ports.find(port => port.id === route.to)];
const selectedCell = () => selection.slot != null && Number.isInteger(selection.x);
const asset = (url,classes='',alt='') => urls(url) ? `<img class="${classes}" src="${attr(urls(url))}" alt="${attr(alt)}" draggable="false">` : '';
const volume = (item,amount) => `${fmt(amount)}${items.get(item)?.kind === 'fluid' ? ' L' : ''}`;
const dye = index => DYE_COLORS[index] || DYE_COLORS[15];

function itemTile(entry, options={}) {
  const id = typeof entry === 'string' ? entry : entry?.item || entry?.id;
  if (!id) return '<div class="item-slot item-empty" aria-hidden="true"></div>';
  const item = items.get(id);
  const className = options.catalog ? ' catalog-item' : '';
  const ren = !!entry.renamed;
  return `<button type="button" class="item-slot${className}" data-tip-item="${attr(id)}" data-item-id="${attr(id)}" data-action="${options.action || 'none'}" ${options.data || ''} ${options.catalog||options.drag?'draggable="true"':''} ${options.lookup?'data-recipe-link':''} ${ren?'data-renamed="true"':''} aria-label="${attr(itemName(id))}${ren?'，重命名':''}">${asset(itemIcon(item),'pixel') || `<span class="item-glyph ${item?.kind==='fluid'?'fluid':''}">${item?.kind==='fluid'?'◆':'⬡'}</span>`}${entry.amount != null ? `<small>${esc(fmt(entry.amount))}</small>`:''}${ren?'<i class="item-star">★</i>':''}</button>`;
}

function readBookmarks() {
  try {
    const values=JSON.parse(localStorage.getItem('nac.bookmarkedItems'));
    return new Set(Array.isArray(values)?values.filter(value=>typeof value==='string'):[]);
  } catch { return new Set(); }
}

function toggleBookmark(id) {
  if (!items.has(id)) return false;
  const removed=bookmarks.delete(id);
  if (!removed) bookmarks.add(id);
  localStorage.setItem('nac.bookmarkedItems',JSON.stringify([...bookmarks]));
  const body=app.querySelector('.bookmark-panel');
  if (body) {
    const scroll=body.querySelector('.bookmark-grid')?.scrollTop||0;
    body.innerHTML=bookmarkContents();
    const grid=body.querySelector('.bookmark-grid');
    if (grid) grid.scrollTop=scroll;
  }
  notify(removed?'已取消收藏':'已收藏');
  return true;
}

function notify(message, error=false) {
  notice.textContent = message;
  notice.classList.toggle('is-error',error);
  notice.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { notice.hidden = true; },error?7000:3300);
}

function changed(renderNow=true,{analysis=true,label,record=true}={}) {
  if (record&&!operationHistory.record(project,label)) return;
  version++;
  dirty = true;
  if (analysis) {
    reports.clear();
    recipeVersion++;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist().catch(error => notify(error.message,true)),800);
  if (renderNow) {
    render();
    if (modal?.kind==='recipes'&&modal.moduleSlot!=null) refreshMatchingRecipes();
    else if (modal?.kind==='results'||modal?.kind==='splitter'||modal?.kind==='final-recipes') renderModal();
  }
  if (!renderNow&&analysis&&modal?.kind==='final-recipes') {
    const stale=dialog.querySelector('.final-stale');
    const data=dialog.querySelector('.final-data');
    if (stale&&data) { stale.hidden=false; data.hidden=true; }
  }
  if (!renderNow) updateHistoryControls();
  if (modal?.kind==='operations') refreshOperationList();
  if (modal?.kind==='arrange') refreshArrangementProject();
}

async function persist(checkpoint=false) {
  clearTimeout(saveTimer);
  while (saving) await saving;
  if (!dirty && !checkpoint) return;
  if (portableBinding) throw Error('正在切换工程，请稍后保存。');
  const history=operationHistory.serialize();
  if (localOnly) {
    try { localStorage.setItem('nac.recovery',JSON.stringify({project,operationHistory:history,backups:localBackups})); }
    catch (error) {
      if (error.name!=='QuotaExceededError') throw error;
      try { localStorage.setItem('nac.recovery',JSON.stringify({project,operationHistory:history})); }
      catch (error) {
        if (error.name!=='QuotaExceededError') throw error;
        localStorage.setItem('nac.recovery',JSON.stringify(project));
      }
    }
    dirty = false;
    updateStatus();
    return;
  }
  const savingVersion = version;
  saving = api(`/api/projects/${project.id}`, { project,revision,checkpoint,operationHistory:history });
  updateStatus();
  try {
    const saved = await saving;
    revision = saved.revision;
    if (portableEdition && typeof saved.path==='string') portableProjectPath=saved.path;
    savedVersion = savingVersion;
    dirty = savedVersion !== version;
    localStorage.setItem('nac.lastProject',project.id);
    syncProjectAddress();
  } finally {
    saving = null;
    updateStatus();
  }
}

function loadProjectSnapshot(raw,history) {
  const next=prepareProject(raw);
  const journal=history&&isLegacyGridLayout(raw.gridLayout)?migrateOperationHistory(raw,history,prepareProject):history;
  project=next;
  operationHistory=createOperationHistory(project,journal);
}

function syncProjectAddress(opened=false) {
  if (!webEdition || localOnly || !revision) return;
  const hash = location.hash;
  if (!opened && hash && (!hash.startsWith(projectAddressPrefix) ||
      new URLSearchParams(hash.slice(1)).get('id') !== project.id)) return;
  const address = new URL(location.href);
  address.hash = new URLSearchParams({ project:project.name, id:project.id }).toString();
  if (address.href !== location.href) window.history.replaceState(window.history.state,'',address);
}

async function switchProject(next, nextRevision=0, history=null, backups=[], { addressHash='', boundPath='' }={}) {
  if (!addressHash) closeModal();
  // A native opener has already flushed and rebound the writer to the new file.
  if (!boundPath) while (dirty||saving) await persist();
  const nextFile = webEdition && !localOnly ? await getWebProjectFile(next.id) : null;
  if (addressHash && location.hash!==addressHash) return;
  if (addressHash) closeModal();
  issueFocus=null;
  loadProjectSnapshot(next,history);
  if (boundPath) {
    dirty = false;
    savedVersion = version;
  }
  localBackups=backups;
  revision = nextRevision;
  if (webEdition) webProjectFile = nextFile;
  if (portableEdition) portableProjectPath = boundPath;
  selection = { slot:null,x:null,y:null,port:null,route:null };
  draft = null;
  drawer = 'properties';
  structureWindows.clear();
  portWindows.clear();
  camera = { zoom:1,x:0,y:0 };
  activeCircuit = 0;
  reports.clear();
  if (!nextRevision && !boundPath) { changed(false,{record:false}); await persist(); }
  else localStorage.setItem('nac.lastProject',project.id);
  syncProjectAddress(true);
  render();
}

function withPortableProjectLock(operation, { allowDiscard = false }={}) {
  const task = portableProjectQueue.then(async()=>{
    document.activeElement?.blur();
    cancelPortDrag();
    if (routeDrag?.moved) { routeDrag=null; render(); }
    else routeDrag=null;
    const surfaces = [app,dialog,contextMenu,floatingWindows];
    const previous = surfaces.map(surface=>surface.inert);
    surfaces.forEach(surface=>{ surface.inert=true; });
    portableProjectBusy=true;
    updateStatus();
    try {
      try {
        while (dirty||saving) await persist();
      } catch (error) {
        if (!allowDiscard || error.status!==409) throw error;
        if (!window.confirm('原工程文件已在外部更改，当前编辑还没有保存。成功打开文件后将放弃这些编辑。需要保留编辑时，可先取消并导出工程文件。继续打开吗？')) return;
      }
      portableBinding=true;
      return await operation();
    } finally {
      portableBinding=false;
      portableProjectBusy=false;
      surfaces.forEach((surface,index)=>{ surface.inert=previous[index]; });
      updateStatus();
    }
  });
  // Subsequent launch tokens can still run after a canceled or failed selection.
  portableProjectQueue = task.catch(()=>{});
  return task;
}

async function activatePortableProject(saved) {
  if (typeof saved.path!=='string' || !saved.path) throw Error('无法确认工程文件的位置。');
  await switchProject(saved.project,saved.revision,saved.operationHistory,[],{ boundPath:saved.path });
}

function openPortableProject(openFile) {
  return withPortableProjectLock(async()=>{
    const saved = await openFile();
    if (!saved) return;
    await activatePortableProject(saved);
    notify('已打开本地工程文件');
  },{ allowDiscard:true });
}

async function convertPortableHtml(file) {
  if (!htmlProjectName(file.name)) throw Error('请选择 NAC 工作室保存的 HTML 工程。');
  const imported = prepareProjectImport(await readHtmlProject(file));
  await withPortableProjectLock(async()=>{
    const saved = await api(`/api/projects/${imported.project.id}`,{...imported,revision:0});
    await activatePortableProject(saved);
    notify('已转换为 .nac 工程');
  });
}

function choosePortableProjectFolder() {
  return withPortableProjectLock(async()=>{
    const folder = await desktop.pickProjectFolder();
    if (!folder) return;
    projectDirectory=folder;
    openModal('open',{ rows:await api('/api/projects') });
    notify('已切换工程文件夹');
  });
}

async function showAddressChoices(hash, hint, rows) {
  const choices = rows ?? (localOnly ? [] : await api('/api/projects'));
  if (location.hash!==hash) return;
  openModal('open',{ rows:choices, hint });
  notify(hint);
}

async function followProjectAddress(hash) {
  const params = new URLSearchParams(hash.slice(1));
  const id = params.get('id');
  const name = params.get('project');
  const missing = '当前浏览器找不到该工程。请打开本地 HTML 工程文件。';
  if (localOnly) return showAddressChoices(hash,'浏览器工程库不可用。请打开本地 HTML 工程文件。',[]);
  while (dirty||saving) await persist();
  if (location.hash!==hash) return;
  let selected = id;
  if (id===null) {
    const rows = await api('/api/projects');
    const matches = rows.filter(row=>row.name===name);
    if (matches.length>1) return showAddressChoices(hash,'有多个同名工程，请选择一项。',matches);
    if (!matches.length) return showAddressChoices(hash,missing,rows);
    selected = matches[0].id;
  }
  let saved;
  try { saved=await api(`/api/projects/${encodeURIComponent(selected)}`); }
  catch (error) {
    if (error.status===404) return showAddressChoices(hash,missing);
    throw error;
  }
  if (location.hash===hash) await switchProject(saved.project,saved.revision,saved.operationHistory,[],{ addressHash:hash });
}

async function exportProjectFile() {
  let recovery = false;
  try {
    while (dirty||saving) await persist();
  } catch (error) {
    if (!portableEdition || error.status!==409) throw error;
    recovery = true;
  }
  const { id, name }=project;
  const extension=portableEdition?'.nac':undefined;
  if (localOnly||!revision||recovery) {
    const archive=localProjectFile(project,operationHistory.serialize(),localBackups);
    downloadProjectFile(new Blob([JSON.stringify(archive)],{type:'application/json'}),name,extension);
    if (recovery) notify('请选择保存位置，导出当前编辑副本。');
    return;
  }
  const response=await fetch(`/api/projects/${encodeURIComponent(id)}/file`);
  if (!response.ok) {
    const { error }=await response.json();
    throw Error(error||'工程文件无法读取。');
  }
  downloadProjectFile(await response.blob(),name,extension);
}

const openProjectType = { description:'NAC 工程', accept:{'text/html':['.html','.htm'],'application/json':['.nac','.json']} };
const saveProjectType = { description:'NAC 工程网页', accept:{'text/html':['.html']} };
const htmlProjectName = name => /\.html?$/i.test(name);
const launchHint = '首次 Ctrl+S 时请选择原 HTML 文件，授权写回。';

async function projectDigest(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

const archiveDigest = archive => projectDigest(new TextEncoder().encode(JSON.stringify(archive)));

async function fileStamp(file, bytes) {
  return {
    lastModified:file.lastModified,
    size:file.size,
    hash:await projectDigest(bytes ?? await file.arrayBuffer()),
  };
}

async function openWebFile(file, handle=null) {
  const bytes = await file.arrayBuffer();
  const source = new TextDecoder().decode(bytes);
  const html = htmlProjectName(file.name);
  const raw = html ? await readHtmlProject(source) : JSON.parse(source);
  const attachment = { handle, stamp:await fileStamp(file,bytes) };
  if (html) attachment.archiveHash = await archiveDigest(raw);
  return openWebArchive(raw,attachment,file.name);
}

async function openWebArchive(raw, attachment, fileName) {
  const imported = prepareProjectImport(raw,{copy:false});
  const archive = localProjectFile(imported.project,imported.operationHistory,imported.backups);
  if (Number.isSafeInteger(raw.revision) && raw.revision > 0) archive.revision = raw.revision;
  if (typeof raw.updatedAt==='string' && Number.isFinite(Date.parse(raw.updatedAt))) archive.updatedAt = raw.updatedAt;
  const opened = attachment.launched ? `已打开 HTML 工程。${launchHint}` : `已打开 ${fileName}`;
  if (localOnly) {
    await switchProject(archive.project,0,archive.operationHistory,archive.backups);
    webProjectFile = { ...attachment, revision };
    updateStatus();
    notify(opened);
    return;
  }

  while (dirty||saving) await persist();
  const id = archive.project.id;
  const known = await getWebProjectFile(id);
  if (known) {
    const cached = await api(`/api/projects/${encodeURIComponent(id)}`);
    if (cached.revision !== known.revision) {
      const matchesFile = attachment.stamp && known.stamp?.hash === attachment.stamp.hash;
      const matchesArchive = attachment.archiveHash && known.archiveHash === attachment.archiveHash;
      if (matchesFile || matchesArchive) {
        // A cached edit to this same file should survive reopening the original.
        await storeWebProjectFile(id,{ ...attachment, revision:known.revision });
        await switchProject(cached.project,cached.revision,cached.operationHistory);
        notify(`已恢复浏览器中尚未写入文件的修改。${attachment.launched ? launchHint : ''}`);
        return;
      }
      if (!window.confirm('浏览器中有尚未写入文件的修改。继续打开所选文件并替换这份浏览器记录？')) return;
    }
  }
  const saved = await replaceWebProject(archive,attachment);
  await switchProject(saved.project,saved.revision,saved.operationHistory);
  notify(opened);
}

async function openHtmlLaunch(hash) {
  const archive = await htmlProjectFromHash(hash);
  if (archive) await openWebArchive(archive,{ handle:null, launched:true, archiveHash:await archiveDigest(archive) });
}

async function pickWebProject() {
  if (typeof window.showOpenFilePicker !== 'function') {
    document.querySelector('#project-file').click();
    return;
  }
  const [handle] = await window.showOpenFilePicker({ types:[openProjectType] });
  if (handle) await openWebFile(await handle.getFile(),handle);
}

async function pickWebProjectFolder() {
  const directory = await window.showDirectoryPicker({ mode:'read' });
  const files = new Map();
  for await (const entry of directory.values()) {
    if (entry.kind==='file' && (htmlProjectName(entry.name) || /\.nac(?:\.json)?$/i.test(entry.name))) files.set(entry.name,entry);
  }
  const rows = [...files.keys()].sort((a,b)=>a.localeCompare(b,'zh-CN')).map(name=>({ id:name, name }));
  openModal('project-folder',{ name:directory.name, rows, files });
}

async function writeWebFile(handle, blob, expected) {
  const stream = await handle.createWritable({ mode:'exclusive' });
  try {
    if (expected && (await fileStamp(await handle.getFile())).hash !== expected.hash) {
      throw Error('工程文件已在外部修改，请重新打开或另存为 HTML。');
    }
    await stream.write(blob);
    await stream.close();
  } catch (error) {
    await stream.abort().catch(()=>{});
    throw error;
  }
  return fileStamp(await handle.getFile(),await blob.arrayBuffer());
}

function webFilePending() {
  return !!(webProjectFile?.handle || webProjectFile?.launched) && (dirty || revision !== webProjectFile.revision);
}

async function saveWebFile(saveAs=false) {
  if (webFileSaving) return false;
  const { id, name } = project;
  const target = saveAs ? null : webProjectFile;
  let handle = target?.handle;
  let expected = target?.handle ? target.stamp : null;
  webFileSaving = true;
  updateStatus();
  try {
    // Picker and permission calls must begin during the Save gesture.
    if (handle?.requestPermission) {
      if (await handle.requestPermission({ mode:'readwrite' }) !== 'granted') {
        throw Error('未获得工程文件的写入权限，可以使用另存为 HTML。');
      }
    } else if (!handle && typeof window.showSaveFilePicker === 'function') {
      handle = await window.showSaveFilePicker({ suggestedName:projectFilename(name,'.html'), types:[saveProjectType] });
      if (target?.launched) {
        const existing = await handle.getFile();
        if (existing.size) {
          const source = await existing.arrayBuffer();
          const original = await readHtmlProject(new TextDecoder().decode(source));
          if (await archiveDigest(original) !== target.archiveHash) {
            throw Error('所选 HTML 与打开时的工程内容不同。请重新打开原文件，或使用另存为 HTML。');
          }
          expected = await fileStamp(existing,source);
        }
      }
    }
    if (id!==project.id) return false;
    await persist(true);
    if (id!==project.id) return false;
    const archive = localOnly
      ? localProjectFile(project,operationHistory.serialize(),localBackups)
      : await api(`/api/projects/${encodeURIComponent(id)}/file`);
    const html = !target?.handle || htmlProjectName(handle.name);
    const websiteUrl = new URL(location.href);
    websiteUrl.search = '';
    websiteUrl.hash = '';
    const blob = html ? await createHtmlProject(archive,websiteUrl.href)
      : new Blob([JSON.stringify(archive)],{ type:'application/json' });
    if (!handle) {
      downloadProjectFile(blob,name,'.html');
      notify('已下载 HTML 工程');
      return true;
    }
    const stamp = await writeWebFile(handle,blob,expected);
    const attachment = { handle, stamp, revision:localOnly ? revision : archive.revision };
    if (html) attachment.archiveHash = await archiveDigest(archive);
    if (id===project.id) webProjectFile = attachment;
    if (!localOnly) await storeWebProjectFile(id,attachment);
    notify(`已保存到 ${handle.name}`);
    return true;
  } finally {
    webFileSaving = false;
    updateStatus();
  }
}

function updateStatus() {
  const element = document.querySelector('#save-status');
  if (!element) return;
  const pending = webFilePending();
  const label = webFileSaving ? '正在写入文件' : saving ? '正在保存' : portableProjectBusy ? '正在处理文件' : pending ? '原文件待保存'
    : dirty ? '有修改' : webProjectFile?.handle ? '已保存到文件'
    : webProjectFile?.launched ? '原文件未授权' : revision ? (webEdition?'浏览器已保存':'已保存') : '新工程';
  element.innerHTML = `<i></i>${label}`;
  element.title = portableProjectPath || webProjectFile?.handle?.name || (webProjectFile?.launched ? launchHint : '');
  element.classList.toggle('unsaved',dirty||pending);
}

const canUndo = () => operationHistory.cursor>0;
const canRedo = () => operationHistory.cursor<operationHistory.entries.length;

function updateHistoryControls() {
  for (const control of document.querySelectorAll('[data-action="undo"], [data-action="redo"]')) {
    control.disabled=control.dataset.action==='undo'?!canUndo():!canRedo();
  }
}

function historyButtons() {
  return `${button('undo','撤销','undo',{only:true,disabled:!canUndo(),tip:'撤销 · Ctrl+Z'})}${button('redo','重做','redo',{only:true,disabled:!canRedo(),tip:'重做 · Ctrl+Y 或 Ctrl+Shift+Z'})}`;
}

function refreshOperationList() {
  const scroll=dialog.querySelector('.operation-list')?.scrollTop||0;
  const focused=dialog.contains(document.activeElement);
  renderModal();
  if (focused) dialog.querySelector('[aria-current="step"]')?.focus({preventScroll:true});
  const list=dialog.querySelector('.operation-list');
  if (list) list.scrollTop=scroll;
}

function seekOperation(index) {
  if (index===operationHistory.cursor) return;
  const historyOpen=modal?.kind==='operations';
  if (modal&&!historyOpen) closeModal();
  const next=operationHistory.seek(index);
  if (!next) return;
  closeContext();
  project=next;
  draft=null;
  routeDrag=null;
  const port=getPort(selection.port);
  if (port) Object.assign(selection,{slot:port.slot,x:port.x,y:port.y});
  else if (selection.port) selection={slot:null,x:null,y:null,port:null,route:null};
  if (selection.route&&!getRoute(selection.route)) selection.route=null;
  for (const slot of structureWindows.keys()) if (slot!==-1&&!project.modules[slot]) structureWindows.delete(slot);
  for (const id of portWindows.keys()) if (!getPort(id)) portWindows.delete(id);
  activeCircuit=Math.max(0,Math.min(activeCircuit,project.circuits.length-1));
  syncProjectAddress();
  changed(true,{record:false});
}

function header() {
  const tools = [
    ['new','新建工程','add'], ['open','打开工程','folder'], ['save','保存工程 · Ctrl+S','save'], ['history','工程备份','history'],
    ['import-project',webEdition||portableEdition?'打开本地工程文件':'导入工程文件','upload'], ['download-project',webEdition?'另存为 HTML 工程':'导出工程文件','download'], ['catalog-import','导入游戏数据包','box'],
    ['examples','示例工程','book'], ['notes','工程备注','edit'], ['preferences','主题与快捷键','settings'], ['help','使用帮助','info'], ['about','数据来源与版本','box'],
  ];
  return `<header class="topbar"><div class="identity"><img src="${webAsset('/mark.svg')}" width="30" height="30" alt=""><strong>NAC</strong></div>
    <nav class="project-toolbar" aria-label="工程工具">${tools.slice(0,4).map(([action,label,glyph])=>button(action,label,glyph,{only:true})).join('')}<div class="history-tools" role="group" aria-label="操作历史">${historyButtons()}${button('operations','操作历史','operations',{only:true,data:`aria-expanded="${modal?.kind==='operations'}"`})}</div>${tools.slice(4).map(([action,label,glyph])=>button(action,label,glyph,{only:true})).join('')}</nav>
    <div class="document-title"><input data-field="name" value="${attr(project.name)}" aria-label="工程名称" maxlength="100" spellcheck="false"><span id="save-status" class="save-state"></span></div>
    <div class="top-actions">${button('recipes','合成表','book',{tip:`打开合成表 · ${preferences.shortcuts.book}`})}</div>
  </header>`;
}

function targetsPanel() {
  const toggle=button('toggle-targets',`目标电路 ${project.circuits.length}`,'down',{class:'target-toggle',data:`aria-expanded="${targetsOpen}"`});
  if (!targetsOpen) return `<aside class="target-popover" aria-label="目标电路">${toggle}</aside>`;
  const rows=project.circuits.length ? project.circuits.map((target,index) => {
      const report = reports.get(target.item);
      return `<div class="target ${index===activeCircuit?'selected':''}" data-target-index="${index}"><button class="target-select" type="button" data-action="target" data-index="${index}" data-tip-item="${attr(target.item)}" title="${attr(itemName(target.item))}" aria-pressed="${index===activeCircuit}">${asset(itemIcon(items.get(target.item)),'pixel') || '<span class="item-glyph">⬡</span>'}<span>${esc(itemName(target.item))}</span>${report ? `<i class="${report.ok?'passed':'failed'}"></i>` : ''}</button><input aria-label="${attr(itemName(target.item))}数量" title="目标数量" type="number" min="1" step="1" data-field="quantity" data-index="${index}" value="${attr(target.quantity)}">${button('remove-target-at','移除目标','trash',{only:true,data:`data-index="${index}"`})}</div>`;
    }).join('') : '';
  return `<aside class="target-popover is-open" aria-label="目标电路">${toggle}<div class="target-card"><div class="pane-heading"><h2 ${headingHint('添加电路后，可逐项检查布线和耗材。')}>目标电路</h2>${button('choose-recipe','添加目标','add',{only:true,tip:`添加目标配方 · ${preferences.shortcuts.target}`})}</div>
    <div class="target-list">${rows}</div><div class="target-setup">${button('power','供电与精校','power',{tip:`供电与精校 · ${project.power.ratio} : ${100-project.power.ratio} · 组装 / 其他`})}${button('analyze','验证','check',{class:'secondary',tip:'验证选中电路',disabled:!project.circuits.length})}</div>
    ${button('generate-final','形成最终配方','book',{class:'wide primary',disabled:!project.circuits.length})}</div></aside>`;
}

function bookmarkContents() {
  const saved=[...bookmarks].filter(id=>items.has(id));
  return `${sidebarSeparator('left')}<div class="pane-heading"><h2 ${headingHint('悬浮物品并按 A，可收藏或取消收藏。')}>${icon('bookmark',14)} 收藏 <small>${saved.length}</small></h2><kbd aria-hidden="true">A</kbd></div>
    ${saved.length?`<div class="bookmark-grid">${saved.map(id=>itemTile(id,{catalog:true,lookup:true,action:'catalog-item'})).join('')}</div>`:''}`;
}

const dockSizes = () => workspaceDocks(app.clientWidth||innerWidth,bookmarkWidth,rightWidth,rightCollapsed);
const otherDock = side => side==='left'?'right':'left';

function sidebarSeparator(side) {
  const widths=dockSizes();
  const name=side==='left'?'收藏栏':'右侧栏';
  return `<div class="sidebar-handle" data-sidebar-resize="${side}" role="separator" tabindex="0" aria-orientation="vertical" aria-label="调整${name}宽度" title="拖动调整${name}宽度" aria-valuenow="${widths[side]}" aria-valuemin="${dockLimits[side][0]}" aria-valuemax="${dockMaximum(side,app.clientWidth||innerWidth,widths[otherDock(side)])}"></div>`;
}

function updateDockSizes() {
  const widths=dockSizes();
  const workspace=app.querySelector('.workspace');
  if (!workspace) return;
  workspace.style.setProperty('--left-width',`${widths.left}px`);
  workspace.style.setProperty('--right-width',`${widths.right}px`);
  const canvasWidth=workspace.clientWidth-widths.left-widths.right;
  workspace.classList.toggle('compact-canvas',canvasWidth<480);
  workspace.classList.toggle('tiny-canvas',canvasWidth<380);
  for (const separator of workspace.querySelectorAll('[data-sidebar-resize]')) {
    const side=separator.dataset.sidebarResize;
    separator.setAttribute('aria-valuenow',widths[side]);
    separator.setAttribute('aria-valuemax',dockMaximum(side,app.clientWidth||innerWidth,widths[otherDock(side)]));
  }
}

function resizeDock(side,width,other) {
  const next=clampDockWidth(side,width,app.clientWidth||innerWidth,other);
  if (side==='left') bookmarkWidth=next;
  else rightWidth=next;
  updateDockSizes();
}

function saveDockWidth(side) {
  localStorage.setItem(side==='left'?'nac.bookmarkWidth':'nac.rightWidth',String(side==='left'?bookmarkWidth:rightWidth));
}

function activePortGroup() {
  return portGroup?.project===project && portGroup.ids.has(selection.port) ? portGroup : null;
}

function portGroupMembers(port) {
  const group=activePortGroup();
  if (!group?.ids.has(port.id)) return [port];
  return project.ports.filter(member=>member.slot===port.slot&&group.ids.has(member.id));
}

function portSvg(port, ghost=false) {
  const {x,y} = getPortPosition(port);
  const color = dye(port.color).hex;
  const facing = { n:'M-3 3 0-3 3 3', e:'M-3-3 3 0-3 3', s:'M-3-3 0 3 3-3', w:'M3-3-3 0 3 3', up:'M-3 0h6m-3-3v6',down:'M-3 0h6' }[port.facing] || '';
  const item = items.get(port.items[0]?.item);
  const picture = itemIcon(item);
  const kind = port.kind === 'feed' ? '□' : port.kind === 'final' ? '◆' : port.kind === 'in' ? '◇' : '○';
  const locked=!ghost&&port.locked===true;
  const label=`${kinds[port.kind]} · ${dye(port.color).name} · ${directions[port.facing]}${locked?' · 接口位置已固定':''}`;
  const active = !ghost && (port.id===selection.port || port.id===draft?.anchor);
  const selected = !ghost && activePortGroup()?.ids.has(port.id);
  const interaction = ghost?'':`data-action="select-port" data-port="${attr(port.id)}" ${port.items.length>1?`data-tip-port="${attr(port.id)}"`:''} aria-label="${attr(label)}" ${item?`data-tip-item="${attr(item.id)}"`:''} ${item&&locked?'data-tip-details="接口位置已固定"':''}`;
  const title = !ghost&&(locked||!port.items.length)?`<title>${esc(label)} · Ctrl+点击可多选同一组件的接口</title>`:'';
  const badge = locked?`<g class="port-lock-badge" transform="translate(-7 -7)" aria-hidden="true"><circle r="4.5"/><path d="${icons.lock}" transform="translate(-4.5 -4.5) scale(.375)"/></g>`:'';
  return `<g class="map-port ${active?'map-active':''} ${selected?'port-group-selected':''} ${locked?'port-position-locked':''}" transform="translate(${x} ${y})" ${interaction}>${title}<rect x="-9" y="-9" width="18" height="18" rx="2" fill="${color}" stroke="#091012" stroke-width="1.5"/>${picture?`<image class="pixel" href="${attr(picture)}" x="-7" y="-7" width="14" height="14"/>`:`<text text-anchor="middle" y="4" font-size="11">${kind}</text>`}<path class="port-direction" d="${facing}" transform="translate(6,-6) scale(.63)" fill="none" stroke="#0c1315" stroke-width="2"/>${port.items.some(entry=>entry.renamed)?'<text x="3" y="8" class="map-star">★</text>':''}<rect class="port-hit" x="-10" y="-10" width="20" height="20" rx="3"/>${badge}</g>`;
}

function platformSvg(slot) {
  const box = getPlatform(slot);
  const module = project.modules[slot];
  const info = modules.get(module?.type);
  const active = selection.slot===slot;
  const baseClass = slot===-1?'core':module?'installed':'empty';
  const cells = [];
  for (let y=0;y<7;y++) for (let x=0;x<7;x++) {
    if (!isPortCell(slot,x,y)) continue;
    const cell = getCell(slot,x,y);
    const on = active && selection.x===x && selection.y===y;
    const valid=module&&canPlace(slot,x,y);
    cells.push(`<rect class="map-cell ${on?'cell-active':''} ${valid?'port-cell':''}" x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" data-action="cell" data-slot="${slot}" data-x="${x}" data-y="${y}" />`);
  }
  const texture = urls(dataset.blocks?.mesh || dataset.textures?.mesh || dataset.platformTexture);
  const display = slot===-1?'':urls(info?.wikiImage || info?.illustration || info?.preview || info?.render || info?.icon);
  const polygon = getFootprint(slot).map(pair=>pair.join(',')).join(' ');
  const number=slotLabel(slot);
  const label = slot===-1?'主体控制室':`槽位 ${number} · ${module?moduleName(module.type):'未安装'}`;
  return `<g class="platform ${baseClass} ${active?'is-selected':''}" data-platform="${slot}">
    <title>${esc(label)}</title><polygon class="platform-back" points="${polygon}"/>
    ${texture && baseClass!=='empty'?`<polygon points="${polygon}" fill="url(#mesh-pattern)" opacity=".34"/>`:''}
    ${display?`<image class="module-map-icon" href="${attr(display)}" x="${box.cx-44}" y="${box.cy-45}" width="88" height="90"/>`:''}
    ${cells.join('')}
    ${slot===-1?'':module?`<text class="slot-num" x="${box.x+8}" y="${box.y+34}">${number}</text>`:`<text class="slot-num empty-num" x="${box.cx}" y="${box.cy-13}">${number}</text><text class="slot-plus" x="${box.cx}" y="${box.cy+16}">＋</text>`}
    </g>`;
}

const routeIsVisible = route => !route.hidden&&showLayers.has(route.layer??0);
const eyePath = 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z';

function routeVisibilityControl(action,visible,label,data='',disabled=false) {
  return `<button type="button" class="route-visibility ${visible?'':'off'}" data-action="${action}" ${data} title="${attr(label)}" aria-label="${attr(label)}" ${disabled?'disabled':''}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" aria-hidden="true"><path d="${eyePath}"/>${visible?'':'<path d="m3 3 18 18"/>'}</svg></button>`;
}

function routeVisibilityButton(route) {
  const visible=routeIsVisible(route);
  return routeVisibilityControl('toggle-route-visibility',visible,`${visible?'隐藏':'显示'}${routeName(route)}`,`data-route="${attr(route.id)}"`);
}

function allRoutesVisibilityButton() {
  const visible=project.routes.some(routeIsVisible);
  return routeVisibilityControl('toggle-all-routes',visible,visible?'隐藏全部线路':'显示全部线路','',!project.routes.length);
}

const strokeAttributes = style => `stroke-dasharray="${attr(style.dash||'none')}" stroke-linecap="${attr(style.lineCap)}"`;

function routeMasks(routes,cuts,prefix) {
  const ids=new Map();
  const defs=routes.map((route,index)=>{
    const gaps=cuts.get(route.id);
    if (!gaps?.length) return '';
    const id=`${prefix}-route-mask-${index}`;
    ids.set(route.id,id);
    const xs=route.points.map(point=>point.x),ys=route.points.map(point=>point.y);
    const x=Math.min(...xs)-12,y=Math.min(...ys)-12;
    const width=Math.max(...xs)-x+12,height=Math.max(...ys)-y+12;
    return `<mask id="${id}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${width}" height="${height}"><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#fff"/>${gaps.map(gap=>`<rect x="${gap.x}" y="${gap.y}" width="${gap.width}" height="${gap.height}" rx="${ROUTE_CUT_RADIUS}" fill="#000"/>`).join('')}</mask>`;
  }).join('');
  return {ids,defs};
}

function routePaint(route,color,mask,cuts) {
  const stroke=strokeAttributes(route);
  const arrow=route.loose?null:routeArrow(route.points,{dash:route.dash,cuts});
  return `<g class="route-paint" ${mask?`mask="url(#${mask})"`:''}>
    <path class="route-shadow" d="${route.paintPath}" ${stroke}/>${route.returning?`<path class="route-return-outline" d="${route.paintPath}" ${stroke}/>`:''}
    <path class="route-line" d="${route.paintPath}" stroke="${color}" ${stroke}/>${arrow?`<path class="route-arrow" d="${ROUTE_ARROW_PATH}" fill="${color}" transform="translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})"/>`:''}</g>`;
}

function draftingGridPattern(id) {
  return `<pattern id="${id}" x="${GRID_ORIGIN}" y="${GRID_ORIGIN}" width="${CELL_SIZE}" height="${CELL_SIZE}" patternUnits="userSpaceOnUse"><path d="M ${CELL_SIZE} 0 L 0 0 0 ${CELL_SIZE}" class="grid-line"/></pattern>`;
}

function moduleFluidMarkup() {
  const {badges,bounds}=showModuleFluids?layoutModuleFluidBadges(project,dataset):{badges:[],bounds:null};
  moduleFluidBounds=bounds;
  return badges.map(({slot,item,x,y,width,height})=>{
    const name=itemName(item);
    const picture=itemIcon(items.get(item));
    const rect=(inset=0)=>`x="${x+inset}" y="${y+inset}" width="${width-2*inset}" height="${height-2*inset}"`;
    return `<g class="map-fluid" role="button" tabindex="${draft?-1:0}" data-module-fluid data-action="module-fluid-recipes" data-slot="${slot}" data-fluid="${attr(item)}" data-tip-item="${attr(item)}" aria-label="${attr(`${name} · ${slotName(slot)} · 查看相关配方`)}">
      <rect class="map-fluid-cell" ${rect()}/>${picture?`<image class="map-fluid-image pixel" ${rect(2.5)} href="${attr(picture)}" preserveAspectRatio="none"/>`:`<text class="map-fluid-fallback" x="${x+width/2}" y="${y+height/2}">◆</text>`}<rect class="map-fluid-outline" ${rect(3.25)}/></g>`;
  }).join('');
}

function svgMarkup() {
  const texture = urls(dataset.blocks?.mesh || dataset.textures?.mesh || dataset.platformTexture);
  const geometry = buildRoutes(project);
  routeGeometry = new Map(geometry.map(route=>[route.id,route]));
  const visible = geometry.filter(route => routeIsVisible(route) && route.id!==draft?.editing && route.id!==issueFocus?.target.route?.id);
  // The inspected line is drawn last, even if it was hidden or covered by other lines.
  const inspected=issueFocus?.target.route;
  if (inspected) visible.push(inspected);
  const cuts=routeCutouts(visible);
  const masks=routeMasks(visible,cuts,'board');
  const routeLabels=[];
  const routePaths = visible.map(route => {
    const color = routeInk(route.displayColorIndex);
    const points = route.points || [];
    const last = points.at(-1);
    const end = last && route.loose ? `<circle class="loose-end" data-endpoint="true" cx="${last.x}" cy="${last.y}" r="8" stroke="${color}"/>`:'';
    const returning=route.returning;
    const focused=route===inspected;
    const label=!returning && selection.route===route.id && routeLabelPoint(route);
    if (label) routeLabels.push(`<text class="route-name" text-anchor="${label.horizontal?'middle':'start'}" x="${label.x+(label.horizontal?0:10)}" y="${label.y+(label.horizontal?-9:5)}">${esc(routeName(route))}</text>`);
    const halo=focused?`<path class="issue-route-halo" d="${route.paintPath}"/>`:'';
    return `<g class="route ${selection.route===route.id?'route-active':''} ${route.locked?'route-locked':''} ${returning?'route-return':''}" data-route="${attr(route.id)}" ${focused?`data-focus-route="${attr(route.id)}"`:''} data-action="select-route"><title>${esc(routeName(route))}${returning?' · 成品回流':''}${route.locked?' · 已固定':''}${route.loose?' · 未接线':''}</title>${halo}${routePaint(route,color,focused?null:masks.ids.get(route.id),cuts.get(route.id))}<path class="route-hit" d="${route.path}"/>${end}</g>`;
  }).join('');
  const labels=Array.from({length:13},(_,index)=>{
    const slot=index-1;
    const module=project.modules[slot];
    if (slot>=0&&!module) return '';
    const {cx,cy,width}=getPlatform(slot);
    const label=slot===-1?'主体控制室':moduleName(module.type);
    const textWidth=width-20;
    const fit=label.length*13>textWidth?`textLength="${textWidth}" lengthAdjust="spacingAndGlyphs"`:'';
    return `<text class="platform-caption platform-label" aria-hidden="true" x="${cx}" y="${cy}" ${fit}>${esc(label)}</text>`;
  }).join('');
  const cellPattern=`x="${GRID_ORIGIN}" y="${GRID_ORIGIN}" width="${CELL_SIZE}" height="${CELL_SIZE}" patternUnits="userSpaceOnUse"`;
  return `<defs>${draftingGridPattern('draft-grid')}${texture?`<pattern id="mesh-pattern" ${cellPattern}><image width="${CELL_SIZE}" height="${CELL_SIZE}" href="${attr(texture)}" class="pixel"/></pattern>`:''}${masks.defs}</defs>
    <rect x="-2080" y="-2080" width="5200" height="5200" fill="url(#draft-grid)" data-action="map-background"/>
    <circle cx="${BOARD_CENTER}" cy="${BOARD_CENTER}" r="${CELL_SIZE*18}" class="draft-ring"/><circle cx="${BOARD_CENTER}" cy="${BOARD_CENTER}" r="${CELL_SIZE*24}" class="draft-ring"/>
    <path d="M${BOARD_CENTER} ${BOARD_MIN+16}V${BOARD_MAX-16}M${BOARD_MIN+16} ${BOARD_CENTER}H${BOARD_MAX-16}" class="draft-ring axis"/>
    ${Array.from({length:13},(_,index)=>platformSvg(index-1)).join('')}
    ${routePaths}${routeLabels.join('')}${labels}${project.ports.map(port=>portSvg(port)).join('')}
    <g class="map-fluid-layer">${moduleFluidMarkup()}</g>
    ${issueFocus?issueFocusMarkers(issueFocus.target):''}
    <g data-port-drag-preview aria-hidden="true"></g>
    <g class="wire-preview" aria-hidden="true"><path class="wire-preview-shadow"/><path class="pending-line"/><circle class="snap-ring" r="13" visibility="hidden"/></g>`;
}

function layerLegend() {
  const sample=style=>`<svg class="layer-swatch" viewBox="0 0 40 8" aria-hidden="true"><path d="M2 4h36" stroke="currentColor" stroke-width="3" ${strokeAttributes(style)}/></svg>`;
  const layers=LAYER_STYLES.map((style,index)=>`<button type="button" data-action="toggle-layer" data-index="${index}" data-tip-layer="${index}" class="${showLayers.has(index)?'':'hidden-layer'}" aria-label="${style.name}线路显隐" aria-pressed="${showLayers.has(index)}">${sample(style)}<span>${style.name}</span></button>`);
  return `<div class="layer-legend">${layers.join('')}<span class="return-legend" data-tip-layer="return" tabindex="0" aria-label="成品回流">${sample(RETURN_STYLE)}<span>回流</span></span></div>`;
}

function board() {
  return `<main class="main-panel"><div class="map-frame"><div class="board-tools" role="toolbar" aria-label="绘图工具">
      ${button('tool-pointer','选择','pointer',{only:true,class:tool==='pointer'?'pressed':'',tip:'选择 · V'})}
      ${button('tool-route','布线','cable',{only:true,class:tool==='route'?'pressed':'',tip:'布线 · R'})}
      ${button('tool-hand','平移','hand',{only:true,class:tool==='hand'?'pressed':'',tip:'平移 · H 或空格'})}
      <span class="separator"></span>${button('zoom-out','缩小','minus',{only:true})}<span class="zoom-value">${Math.round(camera.zoom*100)}%</span>${button('zoom-in','放大','add',{only:true})}${button('zoom-fit','适合窗口','fit',{only:true,tip:'适合窗口 · F'})}
      <span class="separator"></span>${button('toggle-module-fluids','显示流体','fluid',{class:`fluid-toggle${showModuleFluids?' pressed':''}`,data:`aria-pressed="${showModuleFluids}"`})}</div>
    ${issueFocus?`<div class="issue-focus-bar"><div><strong>${esc(issueFocus.target.label)}</strong><small>${esc(issueFocus.message)}</small></div>${button('exit-issue-focus','返回验证','collapse',{tip:'退出定位并恢复视角 · Esc'})}</div>`:''}
    <div class="map-compass" aria-hidden="true">北<span>↑</span></div><svg id="diagram" role="group" aria-label="NAC 主体与周围 12 个功能槽位" viewBox="${viewBox()}">${svgMarkup()}</svg>
    <div class="map-instruction wire-target-hint" role="status" aria-atomic="true"></div>
      ${draft?'<div class="map-instruction">点击接线或放置线头 · Ctrl+点击加折点 · Backspace 撤回折点 · Shift 自由定位 · Esc 取消</div>':tool==='route'?'<div class="map-instruction">选择起始端口</div>':!project.modules.some(Boolean)?'<div class="map-hint">点击空槽安装结构</div>':''}</div>
    <div class="map-status"><span><b>${project.modules.filter(Boolean).length}</b> / 12 模块</span><span><b>${project.routes.filter(routeIsVisible).length}</b> / ${project.routes.length} 线路</span>${allRoutesVisibilityButton()}${layerLegend()}</div></main>`;
}

function viewBox() {
  const side = (BOARD_SIZE+2*fitPadding)/camera.zoom;
  return `${BOARD_CENTER-side/2+camera.x} ${BOARD_CENTER-side/2+camera.y} ${side} ${side}`;
}

function updateView() {
  document.querySelector('#diagram')?.setAttribute('viewBox',viewBox());
  const zoom = document.querySelector('.zoom-value');
  if (zoom) zoom.textContent = `${Math.round(camera.zoom*100)}%`;
}

function fitView() {
  let left=BOARD_MIN, right=BOARD_MAX, top=BOARD_MIN, bottom=BOARD_MAX;
  for (const route of routeGeometry.values()) {
    if (!routeIsVisible(route)) continue;
    for (const point of route.points) {
      left=Math.min(left,point.x);
      right=Math.max(right,point.x);
      top=Math.min(top,point.y);
      bottom=Math.max(bottom,point.y);
    }
  }
  if (moduleFluidBounds) {
    left=Math.min(left,moduleFluidBounds.left); right=Math.max(right,moduleFluidBounds.right);
    top=Math.min(top,moduleFluidBounds.top); bottom=Math.max(bottom,moduleFluidBounds.bottom);
  }
  let side=Math.max(right-left,bottom-top)+2*fitPadding;
  let verticalOffset=0;
  const svg=moduleFluidBounds&&document.querySelector('#diagram');
  if (svg?.clientWidth&&svg.clientHeight) {
    const topInset=Math.min(svg.clientHeight/3,Math.max(0,...fluidMapControls().map(rect=>rect.bottom-svg.getBoundingClientRect().top))+8);
    const scale=Math.min(svg.clientWidth/(right-left+2*fitPadding),(svg.clientHeight-topInset)/(bottom-top+2*fitPadding));
    side=Math.min(svg.clientWidth,svg.clientHeight)/scale;
    verticalOffset=topInset/(2*scale);
  }
  camera={zoom:(BOARD_SIZE+2*fitPadding)/side,x:(right+left)/2-BOARD_CENTER,y:(bottom+top)/2-BOARD_CENTER-verticalOffset};
  updateView();
}

function fluidMapControls() {
  return [...app.querySelectorAll('.board-tools,.target-popover .target-toggle')].map(control=>control.getBoundingClientRect());
}

function fitNewlyVisibleFluids() {
  const bounds=moduleFluidBounds;
  if (!bounds||camera.zoom!==1||camera.x||camera.y) return;
  const controls=fluidMapControls();
  const covered=[...app.querySelectorAll('.map-fluid')].some(badge=>{
    const tile=badge.getBoundingClientRect();
    return controls.some(rect=>tile.left<rect.right&&tile.right>rect.left&&tile.top<rect.bottom&&tile.bottom>rect.top);
  });
  if (covered||Math.min(bounds.left,bounds.top)<BOARD_MIN-fitPadding||Math.max(bounds.right,bounds.bottom)>BOARD_MAX+fitPadding) fitView();
}

function waterPicker(fieldName,label,value,choices,moduleType) {
  const selected=choices.find(([tier])=>String(tier)===String(value??''))?.[1]||'未设置';
  const tooltipData=tier=>tier?`data-water-tier="${tier}" data-water-module="${moduleType}"`:'';
  return `<div class="field water-field"><span>${esc(label)}</span><details class="water-picker">
    <summary aria-label="${attr(label)}" ${tooltipData(value)}><span>${esc(selected)}</span><span aria-hidden="true">⌄</span></summary>
    <div class="water-options">${choices.map(([tier,name])=>`<button type="button" class="${String(tier)===String(value??'')?'pressed':''}"
      data-action="choose-water" data-field="${fieldName}" value="${tier}" ${tooltipData(tier)}>${esc(name)}</button>`).join('')}</div></details></div>`;
}

const waterEffectNames={water:'水消耗',ticks:'配方耗时',eu:'EU/t'};
const times = value=>`×${fmt(value)}`;
const perSecond = value=>`${fmt(value)} L/s`;
const purifiedWater = tier=>dataset.items.find(item=>item.kind==='fluid'&&item.waterTier===Number(tier));
const waterName = tier=>purifiedWater(tier)?.name||`${tier} 级净化水`;
const waterEffect = boost=>boost.effect==='eu'
  ? `EU 消耗 ${times(boost.multiplier)}（EU/t）`
  : `${waterEffectNames[boost.effect]} ${times(boost.multiplier)}`;

function fluidRecipeRows(fluid) {
  return dataset.recipes.filter(recipe=>recipe.module==='cutting'&&recipe.cuttingFluid===fluid);
}

function recipeRange(values,unit) {
  const min=Math.min(...values),max=Math.max(...values);
  return min===max?`${fmt(min)} ${unit}`:`${fmt(min)}～${fmt(max)} ${unit}`;
}

function cuttingStats(fluid,recipes) {
  const doses=recipes.flatMap(recipe=>normalizedInputs(recipe).filter(input=>input.item===fluid).map(input=>input.amount));
  return [
    ...(doses.length?[['单次切割液用量',recipeRange(doses,'L')]]:[]),
    ['基础配方耗时',recipeRange(recipes.map(recipe=>recipe.ticks/20),'秒')],
    ['基础 EU/t',recipeRange(recipes.map(recipe=>recipe.eu),'EU/t')],
  ];
}

function opticalEffects(module,calibration) {
  const tiers=opticalWaterTiers(module);
  const boosts=tiers.map(opticalWaterBoost).filter(Boolean);
  const effects=opticalWaterEffects(tiers,calibration);
  return {
    metrics:Object.entries(effects?.multipliers??{}).map(([effect,multiplier])=>[waterEffectNames[effect],times(multiplier),multiplier<1]),
    waters:[...new Map(boosts.map((boost,index)=>[boost.tier,{...boost,rate:effects?.runningRates[index]}])).values()],
    status:effects?'':'请选择两种不同的净化水',
    note:effects?'启动时检查基础水量，加工期间按显示速率扣除。':'光学优化组织器使用三级至八级净化水。',
  };
}

function structureEffects(module,info,calibration,recipes) {
  switch (module.type) {
    case 'optical': return opticalEffects(module,calibration);
    case 'cutting': {
      const fluid=module.fluid||purifiedWater(module.waterTier)?.id;
      if (!fluid) return {status:'待选切割液',note:'净化水档位决定框架切割配方，切割液用量与耗时以具体配方为准。'};
      const recipes=fluidRecipeRows(fluid);
      return {rows:[['当前切割液',itemName(fluid)],['对应切割配方',`${fmt(recipes.length)} 条`],
        ...(recipes.length?cuttingStats(fluid,recipes):[])],note:module.fluid&&module.waterTier?'当前以指定切割液为准。':''};
    }
    case 'board': {
      const impurity=Number(module.config?.impurity??0);
      const fluid=items.get(module.fluid)||dataset.items.find(item=>item.boardFluidTier===Number(module.fluid));
      const rows=[['浸洗液',fluid?.name||itemName(module.fluid)],['浸洗液杂质',`${fmt(impurity)}%`]];
      const note='杂质率需在 0% 至 100% 以下。完全污染时停止加工。';
      if (impurity<0||impurity>=100||!Number.isFinite(impurity)) return {rows,status:'杂质率无效',note};
      const multiplier=immersionDurationMultiplier(impurity);
      return {rows:[...rows,['配方耗时',times(multiplier),multiplier<1]],note};
    }
    case 'assembly': {
      const tier=Number(module.casingTier)||voltageTiers.indexOf(module.casingTier);
      const note='外壳每比配方要求高一档，EU/t 再乘 0.95。';
      if (tier<1) return {status:'待选外壳等级',note};
      const requirements=[...new Set(recipes.map(recipe=>recipe.casingTier??1))].sort((a,b)=>a-b);
      return {rows:requirements.map(required=>['级配方',tier>=required?`EU/t ${times(assemblyPowerMultiplier(tier,required))}`:'外壳等级不足',tier>required,voltageTiers[required]]),note};
    }
    case 'etching': {
      const tier=voltageTiers.indexOf(module.config?.laserTier);
      const amps=Number(module.config?.laserAmps);
      const hatches=info?.options?.laserHatches||[];
      if (tier<0||!amps) return {status:'待选激光源仓的电压和电流'};
      if (hatches.length&&!hatches.some(hatch=>hatch.tier===tier&&hatch.amps===amps)) return {status:'没有对应的激光源仓'};
      const {eu,ticks}=etchingDivisors(tier,amps,calibration);
      return {rows:[['EU/t',eu===1?'×1':`÷${eu}`,eu>1],['配方耗时',ticks===1?'×1':`÷${ticks}`,ticks>1]]};
    }
    case 'bio': {
      const multiplier=biologicalFluidMultiplier(calibration);
      const value=multiplier===0?'免除':times(multiplier);
      return {rows:[['配方流体用量',value,multiplier<1]],note:multiplier===0.5?'配方流体用量减半后向下取整。':''};
    }
    case 'superconductor': return {rows:[['超级冷却液',perSecond(info?.options?.coolantPerSecond??1000)],
      ['供液设置',module.fluid==='fluid:SuperCoolant'||module.config?.coolant?'已设置':'未设置']],note:'加工期间持续消耗。'};
    default: return null;
  }
}

const moduleCalibrationFamilies = {
  assembly:['primitive'], etching:['crystal'], bio:['wetware','bio'], optical:['optical'],
};
const displayCalibrationTier = level => Math.max(0,Math.min(3,Math.trunc(level)));

function moduleCalibrationBadge(module,recipes,{family,level}) {
  const direct=moduleCalibrationFamilies[module.type]??[];
  const related=family ? direct.includes(family) : direct.length>0;
  // Count component and recipe-specific effects here; the common EU/t discount is NAC-wide.
  if (!related&&!recipes.some(recipe=>{
    const tag=calibrationFamily(recipe.calibration);
    return tag&&(family?tag===family:true);
  })) return '';
  const tier=displayCalibrationTier(level);
  const label=!tier?'未精校':!family?'待选电路族':`${CALIBRATION_FAMILIES[family].name} · ${calibrationLevelNames[tier]}精校`;
  return `<span class="effect-calibration${tier&&family?'':' inactive'}">${esc(label)}</span>`;
}

function moduleCalibrationHint(calibration,note) {
  const {family,level}=calibration;
  const familyInfo=CALIBRATION_FAMILIES[family];
  const tier=displayCalibrationTier(level);
  const heading=familyInfo?`${familyInfo.name} · ${tier?`${calibrationLevelNames[tier]}精校`:'未精校'}`:'精校未启用';
  let levels=tier?Array.from({length:tier},(_,index)=>index):[];
  if (family==='special'&&tier) levels=[tier-1];
  if (family==='primitive'&&tier===3) levels=[0,2];
  const descriptions=familyInfo?levels.map(index=>`${calibrationLevelNames[index+1]}　${familyInfo.effects[index]}`):[];
  return [heading,...descriptions,descriptions.length?familyInfo.note:'',note].filter(Boolean).join('\n');
}

function moduleEffectWaters(waters) {
  return `<ul class="effect-waters">${waters.map(({tier,rate,perSecond:base})=>{
    const water=purifiedWater(tier);
    return `<li class="effect-water" tabindex="0" data-water-tier="${tier}" data-water-module="optical" aria-label="${attr(waterName(tier))}">
      <span class="effect-water-name">${asset(itemIcon(water),'pixel')}<span>${esc(waterName(tier).split('（')[0])}</span></span>
      <span class="effect-rate${rate!=null&&rate<base?' effect-benefit':''}">${rate==null?'<small>基础</small> ':''}<strong>${fmt(rate??base)}</strong> <small>L/s</small></span>
    </li>`;
  }).join('')}</ul>`;
}

function moduleEffects(module,info,availableRecipes) {
  const selected=new Set(Object.values(module.config?.recipeSelections||{}));
  const recipes=selected.size?availableRecipes.filter(recipe=>selected.has(recipe.id)):availableRecipes;
  const calibration=currentCalibration();
  const effects=structureEffects(module,info,calibration,recipes);
  if (!effects) return '';
  const {rows=[],metrics=[],waters=[],status,note}=effects;
  const hint=moduleCalibrationHint(calibration,note);
  const displayRows=(entries,className)=>`<dl class="${className}">${entries.map(([label,value,benefit,tier])=>`<div>
    <dt>${tier?`<span class="voltage-label" data-voltage="${attr(tier)}">${esc(tier)}</span> `:''}${esc(label)}</dt><dd${benefit?' class="effect-benefit"':''}>${esc(value)}</dd></div>`).join('')}</dl>`;
  return `<section class="module-effect" data-module-effect="${module.type}" aria-label="当前效果">
    <header><b>当前效果</b>${moduleCalibrationBadge(module,recipes,calibration)}<button type="button" class="effect-help" data-module-effect-help ${headingHint(hint)} aria-label="查看当前精校效果">?</button></header>
    ${metrics.length?displayRows(metrics,'effect-metrics'):''}
    ${rows.length?displayRows(rows,'effect-rows'):''}
    ${waters.length?moduleEffectWaters(waters):''}
    ${status?`<p class="effect-status">${esc(status)}</p>`:''}
  </section>`;
}

function moduleControls(module,slot) {
  const info = modules.get(module.type);
  const fluids = dataset.items.filter(item => item.kind==='fluid');
  const recipes = dataset.recipes.filter(recipe=>recipe.module===module.type);
  const moduleInputs = recipes.flatMap(normalizedInputs);
  const moduleFluidSet = new Set(moduleInputs.filter(input=>items.get(input.item)?.kind==='fluid').map(input=>input.item));
  const fixedFluidSet = new Set(moduleInputs.filter(input=>!input.continuous && items.get(input.item)?.kind==='fluid').map(input=>input.item));
  const filteredFluids = fluids.filter(item=>moduleFluidSet.has(item.id) || item.id===module.fluid || (module.type==='board' && item.boardFluidTier) || (module.type==='superconductor' && /超级冷却液/.test(item.name)));
  const currentWaterChoices=waterChoices.map(([tier,label])=>[tier,fluids.find(item=>item.waterTier===tier)?.name || label]);
  const waterTier = opticalWaterTiers(module);
  const configs = [];
  if (module.type==='assembly') configs.push(field('部件装配线外壳',voltageSelect('module-casing',module.casingTier,'未设置',voltageTiers.slice(1).map((tier,index)=>[index+1,tier]))));
  if (module.type==='cutting') configs.push(waterPicker('module-water','净化水档位',module.waterTier,currentWaterChoices,module.type));
  if (module.type==='optical') {
    const validWater=currentWaterChoices.slice(0,1).concat(currentWaterChoices.slice(3));
    configs.push(`<div class="field-pair">${waterPicker('module-water-0','净化水一',waterTier[0],validWater,module.type)}${waterPicker('module-water-1','净化水二',waterTier[1],validWater,module.type)}</div>`);
  }
  if (module.type==='etching') configs.push(`<div class="field-pair">${field('激光电压',voltageSelect('module-laser-tier',module.config?.laserTier,'未设置'))}${field('激光电流 · A',number('module-laser-amps',module.config?.laserAmps,'min="1" step="1"','未设置'))}</div>`);
  if (filteredFluids.length && ['cutting','board','superconductor'].includes(module.type)) configs.push(field(module.type==='board'?'浸洗液':'模块供液',select('module-fluid',module.fluid,[['','未设置'],...filteredFluids.map(item=>[item.id,item.name])])));
  if (module.type==='board') configs.push(field('浸洗液杂质 · %',number('module-impurity',module.config?.impurity,'min="0" max="100" step="1"','默认 0')));
  configs.push(moduleEffects(module,info,recipes));
  if (fixedFluidSet.size && module.type!=='splitter') {
    const supplied=module.config?.fluids;
    const fluidOptions=fluids.filter(item=>fixedFluidSet.has(item.id));
    configs.push(`<details ${Array.isArray(supplied)?'open':''}><summary>定量流体供给</summary>
      ${toggle('module-supply-manual',Array.isArray(supplied),'只验证指定流体','默认按配方从主网供给。开启后，验证会检查下方列出的流体。')}
      ${Array.isArray(supplied)?`<div class="supply-list">${fluidOptions.map(item=>`<label class="toggle"><input type="checkbox" data-field="module-supply-fluid" data-id="${attr(item.id)}" ${supplied.includes(item.id)?'checked':''}><span>${esc(item.name)}</span></label>`).join('')}</div>`:''}</details>`);
  }
  return `<div class="module-summary">${asset(info?.icon,'pixel module-thumb')}<b>${esc(moduleName(module.type))}</b>
    <div class="window-actions">${module.type!=='splitter'?button('module-recipes','匹配配方','book',{only:true,data:`data-slot="${slot}"`}):''}${button('replace-module','更换结构','box',{only:true,data:`data-slot="${slot}"`})}</div></div>
    <div class="module-fields">${field('控制器朝向',select('module-rotation',module.rotation,[[0,'北 ↑'],[90,'东 →'],[180,'南 ↓'],[270,'西 ←']]))}${configs.join('')}
    ${module.type==='splitter'?`${button('splitter','打开分流器','cable',{class:'wide secondary',data:`data-slot="${slot}"`})}<div class="muted small">${module.rules.length} 条规则</div>`:`${toggle('module-isolate',module.isolate,'输入颜色分离','启用后同色组件参与同一配方')}${toggle('module-ignore',module.ignoreMaterials,'忽略模块额外耗材','主网供液时，统计表排除这个结构的定量流体。验证仍检查实际配方。')}`}
    </div>`;
}

function portControls(port) {
  const connections = project.routes.filter(route=>route.from===port.id || route.to===port.id);
  const portData=`data-port-owner="${attr(port.id)}"`;
  const portTarget=`data-port="${attr(port.id)}"`;
  return `<div class="sub-head"><b>${coordinate(port)} 端口</b><div class="window-actions">${button('start-wire','新建线路','cable',{data:portTarget})}${button('port-menu','端口菜单','menu',{only:true,data:portTarget})}</div></div>
    ${field('类型',select('port-kind',port.kind,portKinds(port.slot)))}
    <div class="field-pair">${field('方向',select('port-facing',port.facing,Object.entries(directions)))}${field('颜色',`<div class="dye-input"><i style="--dye:${dye(port.color).hex}"></i>${select('port-color',port.color,colors)}</div>`)}</div>
    <div class="sub-head"><b ${headingHint('右键物品可添加重命名标记。')}>物品标记</b></div>
    <div class="port-inventory" data-drop="port" ${portData} aria-label="端口物品标记">${port.items.map((entry,index)=>portMarkTile(port,entry,index)).join('')}${'<div class="item-slot item-empty"></div>'.repeat(Math.max(1,4-port.items.length))}</div>
    ${portSuggestions(port)}
    <div class="control-actions">${button('toggle-catalog','选择物品','box')}<small class="muted">关联 ${connections.length} 条线路</small></div>`;
}

function portMarkTile(port,entry,index) {
  return itemTile(entry,{drag:true,action:'port-item',data:`data-index="${index}" data-item-context="port" data-port-owner="${attr(port.id)}"`});
}

function suggestionBox(entries,action,data='',empty='') {
  if (!entries.length&&!empty) return '';
  return `<div class="mark-suggestions"><b>候选物品</b><div class="suggestion-tiles">${entries.map(entry=>itemTile(entry,{drag:true,action,data})).join('') || `<small class="muted">${esc(empty)}</small>`}</div></div>`;
}

function portSuggestions(port,empty='') {
  const suggestions=portItemSuggestions(project,dataset,port.id).filter(entry=>!port.items.some(mark=>mark.item===entry.item&&!!mark.renamed===!!entry.renamed));
  return suggestionBox(suggestions,'add-port-suggestion',`data-port-owner="${attr(port.id)}"`,empty);
}

function portKinds(slot) {
  return (slot===-1?['feed','final']:['in','out']).map(kind=>[kind,kinds[kind]]);
}

function routeControls(route) {
  const [a,b] = routeEnds(route);
  const source=slotName(a?.slot),destination=b?slotName(b.slot):'未接线';
  return `<div class="sub-head"><b title="${attr(routeHint(route))}">${esc(routeName(route))}</b>${button('route-menu','线路菜单','menu',{only:true,data:`data-route="${attr(route.id)}"`})}</div>
    <div class="route-summary" title="${attr(`${source} → ${destination}`)}"><span>${esc(source)}</span>${icon('arrow',13)}<span>${esc(destination)}</span></div>
    <div class="field-pair">${field('层数',select('route-layer',route.layer,LAYER_STYLES.map((style,index)=>[index,style.name])))}${field('图纸颜色',select('route-display-color',route.displayColor??'', [['','按端口染色'],...colors]))}</div>`;
}

const routeHint = route => route?.locked?'已固定，可从右键菜单解锁。':`${route?.to?'拖动线段':'拖动空心端点'}时吸附格子中心，按住 Shift 可自由拖动。`;

function firstWireGuide(selectedPort,selectedRoute) {
  if (issueFocus||project.routes.length>1) return '';
  const hint=(title,message,actions='')=>`<section class="first-wire-guide" aria-label="布线入门"><h3>${esc(title)}</h3><p>${esc(message)}</p>${actions?`<div class="guide-actions">${actions}</div>`:''}</section>`;
  const ports=project.ports;
  const first=project.routes[0];
  if (first?.to) {
    const [from,to]=routeEnds(first);
    if (!from||!to||draft) return '';
    const repairs=[];
    if (!isOutput(from)||!isInput(to)) repairs.push('起点需要是输出端，终点需要是输入端。');
    if (!matchingPortDyes(from,to,first.color)) repairs.push(first.color!=null?`两端都要设为管道的${dye(first.color).name}染色。`:'把两个接口设为相同染色。');
    if (!repairs.length) return '';
    const endpoint=(label,port)=>button('port-properties',label,'pointer',{data:`data-port="${attr(port.id)}"`});
    return hint('检查第一条线路',repairs.join(''),endpoint('选择起点接口',from)+endpoint('选择终点接口',to));
  }
  const loose=selectedRoute||first;
  const anchor=getPort(draft?.anchor)||selectedPort||getPort(loose?.from);
  const matches=(a,b,pipeDye)=>isInput(a)!==isInput(b)&&matchingPortDyes(a,b,pipeDye);
  if (draft&&anchor) {
    return ports.some(port=>matches(anchor,port,getRoute(draft.editing)?.color))
      ? hint('连接另一端',`点击${dye(anchor.color).name}的${isInput(anchor)?'输出端':'输入端'}完成接线。`)
      : hint('放置线头','当前还没有类型、染色都匹配的另一端。可点击空格先留线头，或按 Esc 返回创建接口。');
  }
  if (selectedCell()&&!selectedPort&&canPlace(selection.slot,selection.x,selection.y)&&!findCellPort(selection.slot,selection.x,selection.y)) {
    const otherPort=ports.find(port=>port.slot!==selection.slot)||ports[0];
    const input=otherPort?isOutput(otherPort):selection.slot!==-1;
    const kind=selection.slot===-1?(input?'final':'feed'):(input?'in':'out');
    const color=otherPort?`创建后，将颜色设为${dye(otherPort.color).name}。`:'';
    return hint('在选中的格子创建接口',`点击下方的「${kinds[kind]}」。${color}`);
  }
  const installed=project.modules.some(Boolean);
  const example=installed?'':button('examples','查看完整示例','book');
  if (selection.slot!=null&&selection.slot>=0&&!project.modules[selection.slot]) {
    return hint(`在 ${slotLabel(selection.slot)} 槽位安装结构`,'选择要放在这个槽位的组件。',button('pick-module','选择结构','add')+example);
  }
  if (!installed) {
    const slot=DISPLAY_SLOTS[0];
    return hint('安装第一个结构','点击画布上带「＋」的任一槽位，选择要安装的组件。',
      button('replace-module',`在 ${slotLabel(slot)} 槽位安装`,'add',{data:`data-slot="${slot}"`})+example);
  }
  if (!ports.length) return hint('选择底板格','点击已安装组件或主体控制室底板上的一个格子，在那里创建接口。');

  const inputDyes=new Set(ports.filter(isInput).map(port=>port.color));
  const source=anchor||ports.find(port=>isOutput(port)&&inputDyes.has(port.color))||ports[0];
  if (!ports.some(port=>matches(source,port))) {
    if (ports.some(port=>isInput(source)!==isInput(port))) {
      return hint('给两端设为相同染色','选中一个接口，在端口属性的「颜色」中选择与另一端相同的染色。');
    }
    const peerKind={feed:'in',final:'out',out:'final',in:'feed'}[source.kind];
    const target=source.slot===-1?'已安装组件':'主体控制室';
    return hint('准备另一端接口',`点击${target}的空格，添加「${kinds[peerKind]}」，两端都使用${dye(source.color).name}。`);
  }
  if (loose?.from===source.id) {
    const data=`data-route="${attr(loose.id)}"`;
    if (selectedRoute?.locked) return hint('线头已固定','要继续移动这个线头，请先解除线路固定。',button('toggle-route-lock','解除线路固定','unlock',{data}));
    if (!loose.locked) return hint('接好悬空的线头','从线头继续，点击同色的另一端接口。',button('move-end','继续接线','cable',{data}));
  }
  if (selectedPort) return hint('新建第一条线路','点击下方「新建线路」，再点击类型相反、染色相同的接口。');
  return hint('选择接线起点',tool==='route'?'点击画布上的起始接口开始接线。':'点击一个接口，再在端口属性里选择「新建线路」。');
}

function inspector() {
  const port = activePort();
  const route = activeRoute();
  const module = activeModule();
  const title = route ? '线路属性' : port ? '端口属性' : selection.slot==null ? '线路' : slotName(selection.slot);
  const guide=firstWireGuide(port,route);
  let controls = '';
  if (route) controls = routeControls(route);
  else if (selection.slot != null) {
    if (selection.slot!==-1 && !module) controls = guide&&project.routes.every(entry=>!entry.to)?'':`<div class="no-selection"><span class="empty-icon">${icon('box',23)}</span><b>槽位尚未安装</b><p>选择 NAC 功能结构以配置接口。</p>${button('pick-module','选择结构','add',{class:'secondary'})}</div>`;
    else {
      controls = '';
      if (port) controls += portControls(port);
      else if (selectedCell()) controls += `<div class="cell-controls"><div class="sub-head"><b>方块 ${coordinate(selection)}</b><small>空方块</small></div>${canPlace(selection.slot,selection.x,selection.y)?`<div class="port-buttons">${portKinds(selection.slot).map(([kind,label])=>button('add-port',label,'add',{data:`data-kind="${kind}"`})).join('')}</div>`:'<p class="field-note">请选择组件底板内的方块放置接口。</p>'}</div>`;
    }
  }
  controls=guide+controls;
  const subject=JSON.stringify(selection);
  const details=(selection.slot===-1||module) ? button('structure','结构详情','box',{only:true,data:`data-slot="${selection.slot}"`}) : '';
  const rows=project.routes.map(entry=>{
    const returning=isCoreReturn(getPort(entry.from),getPort(entry.to));
    return `<div class="wire-row-wrap ${routeIsVisible(entry)?'':'wire-off'} ${returning?'wire-return':''}"><button type="button" class="wire-row ${entry.id===selection.route?'selected':''}" data-action="select-route" data-route="${attr(entry.id)}" title="${attr(`${routeName(entry)} · ${routeHint(entry)}`)}"><i class="context-swatch" style="--wire:${routeInk(entry.displayColor??getPort(entry.from)?.color)}"></i><span>${esc(routeName(entry))}</span>${returning?'<small class="return-badge">成品回流</small>':''}<small>${entry.to?LAYER_STYLES[entry.layer??0]?.name:'未接'}</small>${entry.locked?icon('lock',13):''}</button>${routeVisibilityButton(entry)}</div>`;
  }).join('');
  const headingTip=selection.slot==null&&!route?'选中线路或端口编辑。左键拖动画布空白处可平移。':title;
  return `<section class="inspector" data-subject="${attr(subject)}"><div class="pane-heading"><h2 ${headingHint(headingTip)}>${esc(title)}</h2><div>${details}${project.routes.length?allRoutesVisibilityButton():''}</div></div>${controls?`<div class="inspector-scroll">${controls}</div>`:''}
    ${rows?`<div class="wire-list" aria-label="工程线路">${rows}</div>`:''}</section>`;
}

function catalogMatches(query,kind) {
  const matches = compileSearch(query);
  return dataset.items.filter(item => {
    if (kind==='fluid' && item.kind!=='fluid') return false;
    if (kind==='component' && !item.component && !/^(Processed|Raw|Wrapped)|CC|PC/.test(item.id) && item.category!=='component') return false;
    if (kind==='circuit' && !circuits.includes(item.id)) return false;
    return matches(itemSearchFields(item));
  });
}

function catalogTiles() {
  const result = catalogMatches(catalogQuery,catalogKind);
  const size = 240;
  catalogPage = Math.min(catalogPage,Math.max(0,Math.ceil(result.length/size)-1));
  const page = result.slice(catalogPage*size,(catalogPage+1)*size);
  return `<div class="catalog-grid">${page.map(item=>itemTile(item.id,{catalog:true,lookup:true,action:'catalog-item'})).join('') || '<div class="no-items muted">没有匹配的物品</div>'}</div>
    <div class="catalog-foot"><small>${fmt(result.length)} 项</small><div>${button('catalog-prev','上一页',null,{disabled:catalogPage===0})}<small>${catalogPage+1} / ${Math.max(1,Math.ceil(result.length/size))}</small>${button('catalog-next','下一页',null,{disabled:(catalogPage+1)*size>=result.length})}</div></div>`;
}

const searchHint = '全拼、首字母和汉字可混用。空格分隔关键词，@ 按模组，& 按 ID，$ 按矿物辞典。';

function catalogPane() {
  return `<section class="catalog">
    <div class="catalog-tools"><label class="search-field">${icon('search')}<input type="search" data-search="catalog" aria-label="搜索物品" title="${searchHint}" placeholder="名称、拼音或物品 ID" value="${attr(catalogQuery)}"></label>${select('catalog-kind',catalogKind,[['all','全部'],['component','组件'],['fluid','流体'],['circuit','电路']], 'aria-label="物品分类"')}</div>
    <div id="catalog-tiles">${catalogTiles()}</div></section>`;
}

function render() {
  app.toggleAttribute('data-issue-focus',!!issueFocus);
  hideTooltip();
  delete tooltip.dataset.current;
  const subject=app.querySelector('.inspector')?.dataset.subject;
  const tracks=['.inspector-scroll','.wire-list','.target-list','.catalog-grid','.bookmark-grid'];
  const scrolls=tracks.map(selector=>app.querySelector(selector)?.scrollTop||0);
  app.setAttribute('aria-busy','false');
  const toggleSide=button('toggle-right',rightCollapsed?'展开右侧栏':'收起右侧栏',rightCollapsed?'collapse':'expand',{only:true,data:`aria-expanded="${!rightCollapsed}"`});
  app.innerHTML = `${header()}<div class="workspace ${rightCollapsed?'right-collapsed':''}"><aside class="bookmark-panel" aria-label="物品收藏">${bookmarkContents()}</aside>${board()}${targetsPanel()}<aside class="right-panel" aria-label="布线和物品">${rightCollapsed?toggleSide:`${sidebarSeparator('right')}<div class="side-tabs">${button('drawer-properties','布线','cable',{class:drawer!=='catalog'?'pressed':''})}${button('toggle-catalog','物品','box',{class:drawer==='catalog'?'pressed':'',tip:`物品目录 · ${preferences.shortcuts.items}`})}${button('arrange','整理布线','align',{only:true,disabled:!project.routes.some(route=>route.to&&!route.locked)})}${toggleSide}</div>${drawer==='catalog'?catalogPane():inspector()}`}</aside></div>`;
  if (issueFocus) {
    for (const pane of app.querySelectorAll('.topbar,.workspace > aside,.map-status,.board-tools')) pane.inert=true;
    for (const entry of app.querySelectorAll('#diagram [tabindex]')) entry.setAttribute('tabindex','-1');
  }
  updateDockSizes();
  fitNewlyVisibleFluids();
  updateStatus();
  tracks.forEach((selector,index)=>{
    const pane=app.querySelector(selector);
    if (pane&&(index!==0||subject===JSON.stringify(selection))) pane.scrollTop=scrolls[index];
  });
  if (draft?.point) refreshDraft(draft.point,draft.snap,draft.free);
  renderStructures();
  renderPortWindows();
  refreshPowerCalibration();
}

function openModal(kind, state={}) {
  hideTooltip();
  closeContext();
  stopArrangeWork(modal);
  modal = { kind,...state };
  app.querySelector('[data-action="operations"]')?.setAttribute('aria-expanded',String(kind==='operations'));
  if (!dialogLayouts.has(kind)) dialogLayouts.set(kind,kind==='recipes'
    ?{locked:false,x:10,y:56,width:Math.min(960,Math.round(innerWidth*.65)),height:Math.min(635,Math.round(innerHeight*.78))}
    :{locked:false});
  const layout=dialogLayouts.get(kind);
  layout.z=++windowZ;
  renderModal();
  if (!dialog.open) {
    dialog.show();
    if (document.activeElement?.matches('[data-tip-heading]')) {
      dialog.querySelector('.modal-head [data-action="close"]')?.focus({preventScroll:true});
      hideTooltip();
    }
  }
  positionWindow(dialog,layout);
}
function closeModal() {
  const previous=modal?.kind;
  stopArrangeWork(modal);
  modal=null;
  app.querySelector('[data-action="operations"]')?.setAttribute('aria-expanded','false');
  recipeTrail.length=0;
  if (dialog.contains(document.activeElement)) document.activeElement.blur();
  if (dialog.open) dialog.close();
  if (previous==='splitter' || previous==='power') render();
}
function modalShell(title, subtitle, content, footer='', classes='') {
  const layout=dialogLayouts.get(modal?.kind);
  const slotNumber=/^\d{2}$/.test(subtitle);
  return `<div class="modal-shell ${classes}"><header class="modal-head" data-window-grip><div class="window-heading"><h2 ${headingHint(slotNumber?`槽位 ${subtitle}`:subtitle)}>${esc(title)}</h2>${slotNumber?`<span>${esc(subtitle)}</span>`:''}</div><div class="window-actions">${windowPin('lock-dialog',layout)}${button('close','关闭','close',{only:true})}</div></header><div class="modal-body">${content}</div>${footer?`<footer class="modal-footer">${footer}</footer>`:''}${resizeGrip()}</div>`;
}

function modulePicker() {
  const slot=modal.slot;
  return modalShell('选择功能结构',slotLabel(slot),`<div class="module-picker">${dataset.modules.filter(info=>info.id!=='conversion' && !info.virtual).map(info=>`<button type="button" class="module-choice ${project.modules[slot]?.type===info.id?'selected':''}" data-action="install" data-id="${attr(info.id)}" title="${attr(info.name)}">${asset(info.wikiImage||info.illustration||info.preview||info.icon,'structure-image') || '<span class="item-glyph">⬡</span>'}<b>${esc(info.name)}</b></button>`).join('') || '<p class="muted">结构数据尚未载入。请导入对应版本的数据包。</p>'}</div>`,button('close','关闭',null),'picker-shell');
}

const calibrationLevelNames=['未精校','一级','二级','三级'];

function currentCalibration() {
  const target=items.get(project.circuits[activeCircuit]?.item);
  return calibrationSelection(project.power.calibration,target,dataset);
}

const calibrationEffectsKey=({selected,family,level})=>`${selected}:${family}:${level}`;

function powerCalibrationEffects({selected,family,level}=currentCalibration()) {
  const info=CALIBRATION_FAMILIES[family];
  if (!info) return '<p class="calibration-note">选择目标电路或手动指定电路族后，这里会显示各级精校效果。</p>';
  const title=`${info.name} · 各级效果`;
  const hint=selected?'百分比为游戏内该电路族的历史占比阈值。':`按当前目标电路族显示。百分比为游戏内该电路族的历史占比阈值。`;
  return `<h4 ${headingHint(hint)}>${title}</h4><ol class="calibration-tiers">${info.effects.map((effect,index)=>{
    const tier=index+1;
    return `<li data-calibration-tier="${tier}" ${tier===level?'aria-current="true"':''}><div><strong>${calibrationLevelNames[tier]}</strong><small aria-label="历史占比至少 ${info.thresholds[index]}%">≥ ${info.thresholds[index]}%</small></div><p>${esc(effect)}</p></li>`;
  }).join('')}</ol>${info.note?`<p class="calibration-note">${esc(info.note)}</p>`:''}`;
}

function refreshPowerCalibration() {
  if (modal?.kind!=='power') return;
  const panel=dialog.querySelector('[data-calibration-effects]');
  const current=currentCalibration();
  const key=calibrationEffectsKey(current);
  if (panel&&panel.dataset.calibrationKey!==key) {
    panel.dataset.calibrationKey=key;
    panel.innerHTML=powerCalibrationEffects(current);
  }
}

function powerDialog() {
  const {mode,eu,amps,tier,ratio,calibration} = project.power;
  const current=currentCalibration();
  const total=mode==='amps'&&amps&&dataset.voltages?.[tier]?amps*dataset.voltages[tier]:mode==='eu'?eu:null;
  const matrix=project.modules.filter(module=>module?.type==='assembly').length;
  const others=project.modules.filter(module=>module&&module.type!=='assembly'&&module.type!=='splitter').length;
  const segments=(count,css)=>`<div class="split-segments ${css} ${count?'':'vacant'}">${'<i></i>'.repeat(Math.max(1,count))}</div>`;
  const knob=urls(dataset.gui?.button);
  return modalShell('供电与精校','',`<div class="power-layout">
    <section class="power-column"><h3>${icon('power')} 电力输入</h3>
      ${field('输入方式',select('power-mode',mode,[['eu','直接输入 EU/t'],['amps','按电压与安培数']]))}
      ${mode==='eu'?field('总输入 · EU/t',number('power-eu',eu,'min="1" step="1"','必填')):field('电流 · A',number('power-amps',amps,'min="1" step="1"','必填'))}
      ${field('输入电压等级',voltageSelect('power-tier',tier,'未设置'))}
      <div class="power-total" aria-live="polite">${fmt(total)} EU/t</div></section>
    <section class="power-column power-calibration"><h3>${icon('settings')} 精校</h3>
      ${field('精校电路族',select('power-family',current.selected,[['','按目标电路族'],...Object.entries(CALIBRATION_FAMILIES).map(([id,info])=>[id,info.name])]))}
      ${field('精校等级',select('power-calibration',calibrationLevel(calibration),calibrationLevelNames.map((name,index)=>[index,name])))}
      <div class="calibration-effects" data-calibration-effects data-calibration-key="${calibrationEffectsKey(current)}" aria-live="polite">${powerCalibrationEffects(current)}</div>
    </section>
    <section class="power-column power-distribution"><h3 ${headingHint('组装矩阵和其他加工组件按此比例分配供电，各组内均分。')}>${icon('align')} 能量分配</h3>
      <div class="power-split-values">
        <div class="power-group matrix"><span class="power-group-name">组装矩阵组</span><span class="power-group-count"><b>${matrix}</b> 台</span><strong data-ratio-left>${ratio}%</strong></div>
        <div class="power-group others"><span class="power-group-name">其他加工组</span><span class="power-group-count"><b>${others}</b> 台</span><strong data-ratio-right>${100-ratio}%</strong></div>
      </div>
      <div class="power-slider" style="--ratio:${ratio}%;${knob?`--slider-knob:url('${attr(knob)}')`:''}">
        <div class="power-track" aria-hidden="true">${segments(matrix,'matrix')}${segments(others,'others')}</div>
        <input type="range" data-field="power-ratio" min="1" max="99" step="1" value="${ratio}" aria-label="组装矩阵组供电比例" aria-valuetext="${ratio}% / ${100-ratio}%">
      </div>
    </section></div>`,button('close','完成',null,{class:'primary'}),'power-shell');
}

function updatePowerSlider(input) {
  const ratio=Number(input.value);
  dialog.querySelector('.power-slider')?.style.setProperty('--ratio',`${ratio}%`);
  dialog.querySelector('[data-ratio-left]').textContent=`${ratio}%`;
  dialog.querySelector('[data-ratio-right]').textContent=`${100-ratio}%`;
  input.setAttribute('aria-valuetext',`${ratio}% / ${100-ratio}%`);
}

function recipeCard(recipe) {
  return renderRecipeCard(recipe,{items,itemName,itemIcon,moduleName,esc,asset,fmt});
}

function recipeSearchFields(recipe) {
  const entries=[...normalizedInputs(recipe),...(recipe.outputs||[]),...(recipe.fluidOutputs||[])];
  const itemIds=new Set(entries.map(entry=>entry.item));
  const name=recipe.module==='conversion'?'纳米芯片组件转换':moduleName(recipe.module);
  return [itemSearchFields({id:recipe.id,name}), ...[...itemIds].map(id=>itemSearchFields(items.get(id)||{id}))];
}

function recipeRows() {
  const q = recipeQuery.trim();
  const matches = compileSearch(q);
  const recipeMatches = recipe => !q || matches(recipeSearchFields(recipe));
  if (modal?.moduleSlot!=null) {
    const {moduleSlot,moduleFluid}=modal;
    const fluidRecipes=moduleFluid
      ?new Set(selectedModuleFluids(project.modules[moduleSlot],dataset).find(entry=>entry.item===moduleFluid)?.recipeIds||[])
      :null;
    return listModuleRecipes(project,dataset,moduleSlot)
      .filter(row=>(!fluidRecipes||fluidRecipes.has(row.recipe.id))&&recipeMatches(row.recipe))
      .map(row=>{
        const item=row.recipe.outputs?.[0]?.item;
        return {...row,id:row.recipe.id,item,name:itemName(item)};
      });
  }
  if (recipeFilter==='circuits'&&!modal?.lookup) return targetCircuitRows(circuits,items,q,recipeTier).map(({id,tier})=>{
    const entry=items.get(id);
    const cc=entry?.component;
    const recipe=dataset.recipes.find(row=>row.module==='assembly' && row.outputs?.some(out=>out.item===cc || out.item===id)) || dataset.recipes.find(row=>row.outputs?.some(out=>out.item===id));
    return { id, name:itemName(id), item:id, recipe, tier };
  });
  const source=modal?.lookup?findItemRecipes(dataset,modal.lookup.item,modal.lookup.direction):dataset.recipes;
  return source.filter(recipe=>(recipeFilter==='all'||recipe.module===recipeFilter) && recipeMatches(recipe))
    .map(recipe=>{
      const item=recipe.outputs?.[0]?.item||recipe.fluidOutputs?.[0]?.item;
      return {id:recipe.id,name:itemName(item),item,recipe};
    });
}

function recipeList(rows=recipeRows()) {
  const matchMode=modal?.moduleSlot!=null;
  const showModule=recipeFilter==='all'&&!matchMode;
  const empty=modal?.moduleFluid&&!recipeQuery.trim()?'没有使用该流体的已选配方':'没有匹配的配方';
  return rows.map(row=>{
    const selected=row.id===activeRecipe;
    const module=row.recipe?.module==='conversion'?'纳米芯片组件转换':moduleName(row.recipe?.module);
    const status=matchMode?`${row.selected?'✓ ':''}${row.matched}/${row.required}`:module;
    const tier=row.tier;
    const details=tier||((showModule||matchMode)?status:'');
    return `<button class="recipe-row ${tier?'recipe-row-tier':showModule||matchMode?'':'recipe-row-single'} ${matchMode?'recipe-row-match':''} ${selected?'selected':''}" type="button" data-action="select-recipe" data-id="${attr(row.id)}" ${row.item?`data-tip-item="${attr(row.item)}"`:''} title="${attr(details?`${row.name} · ${details}`:row.name)}" aria-pressed="${selected}">
      ${asset(itemIcon(items.get(row.item)),'pixel') || '<span class="item-glyph">⬡</span>'}<span class="recipe-name">${esc(row.name)}</span>${tier?`<span class="circuit-tier" aria-label="电路等级 ${esc(tier)}"><span class="voltage-label" data-voltage="${attr(tier)}">${esc(tier)}</span></span>`:showModule||matchMode?`<span class="recipe-module">${esc(status)}</span>`:''}</button>`;
  }).join('') || `<p class="muted empty-line">${empty}</p>`;
}

function recipeActions(row) {
  if (modal?.moduleSlot!=null) {
    return button('choose-module-recipe',row?.selected?'取消指定配方':'使用此配方','check',{class:'primary',disabled:!row,data:`data-id="${attr(row?.id)}" data-selected="${!!row?.selected}"`});
  }
  return recipeFilter==='circuits'&&!modal?.lookup?button('add-target','添加至目标','add',{class:'primary',disabled:!row,data:`data-id="${attr(row?.item)}"`}):'';
}

function recipeDetails(row) {
  const match=modal?.moduleSlot!=null&&row?`<div class="recipe-match"><span>已匹配固体原料</span><strong>${row.matched} / ${row.required}</strong></div>`:'';
  return match+recipeCard(row?.recipe);
}

const recipeListMinimum = 176;

function updateRecipeDivider(width=null) {
  const divider=dialog.querySelector('[data-recipe-resize]');
  if (!divider?.offsetWidth) return;
  const layout=divider.parentElement;
  const list=layout.querySelector('#recipe-list');
  const previewMinimum=parseInt(getComputedStyle(layout).getPropertyValue('--recipe-preview-min'),10);
  const maximum=layout.clientWidth-divider.offsetWidth-previewMinimum;
  if (width!=null) {
    recipeListWidth=Math.round(Math.max(recipeListMinimum,Math.min(maximum,width)));
    layout.style.setProperty('--recipe-list-width',`${recipeListWidth}px`);
  }
  divider.setAttribute('aria-valuemax',maximum);
  divider.setAttribute('aria-valuenow',list.offsetWidth);
}

function recipeDialog() {
  const rows = recipeRows();
  if (!rows.some(row=>row.id===activeRecipe)) activeRecipe=rows[0]?.id || '';
  const active = rows.find(row=>row.id===activeRecipe);
  const matchMode=modal.moduleSlot!=null;
  const fluid=matchMode?modal.moduleFluid:null;
  const lookup=modal.lookup;
  const choosingCircuit=recipeFilter==='circuits'&&!lookup&&!matchMode;
  const title=matchMode?'组件匹配配方':lookup?(lookup.direction==='usage'?'配方用途':'制作配方'):modal.choosing?'选择目标配方':'合成表';
  const subtitle=matchMode?`${slotName(modal.moduleSlot)} · ${fluid?'已选配方流体筛选':'匹配真空输入口的固体物品'}`:lookup?itemName(lookup.item):'GTNH 2.9.0';
  const fluidFilter=fluid?`<div class="recipe-fluid-filter" aria-label="已选配方流体筛选" title="${attr(`${slotName(modal.moduleSlot)} · ${itemName(fluid)}`)}">
    ${asset(itemIcon(items.get(fluid)),'pixel')}<span><small>槽位 ${slotLabel(modal.moduleSlot)}</small><b>${esc(itemName(fluid))}</b></span>
    ${button('clear-module-fluid-filter','查看全部匹配配方','close',{only:true})}</div>`:'';
  const filter=matchMode?fluidFilter:`<label class="recipe-filter"><span>加工组件</span>${select('recipe-filter',recipeFilter,[...(lookup?[]:[['circuits','可选电路']]),['all','全部组件'],['conversion','纳米芯片组件转换'],...dataset.modules.filter(module=>dataset.recipes.some(recipe=>recipe.module===module.id)).map(module=>[module.id,module.name])])}</label>`;
  const tierFilter=choosingCircuit?`<label class="recipe-filter recipe-tier-filter"><span>电压等级</span>${voltageSelect('recipe-tier',recipeTier,'全部等级')}</label>`:'';
  const actions=lookup?`<div class="recipe-jump"><div class="window-actions">${recipeTrail.length?button('recipe-back','返回','collapse'):''}${button('recipe-direction','制作',null,{class:lookup.direction==='craft'?'pressed':'',data:'data-value="craft"'})}${button('recipe-direction','用途',null,{class:lookup.direction==='usage'?'pressed':'',data:'data-value="usage"'})}</div></div>`:'';
  return modalShell(title,subtitle,
    `${actions}<div class="recipe-tools"><label class="search-field">${icon('search')}<input type="search" data-search="recipe" aria-label="搜索配方" title="${searchHint}" placeholder="${choosingCircuit?'电路、等级或拼音':'配方物品或拼音'}" value="${attr(recipeQuery)}"></label>${tierFilter}${filter}</div>
    <div class="recipe-layout" ${recipeListWidth?`style="--recipe-list-width:${recipeListWidth}px"`:''}><div id="recipe-list" class="recipe-list">${recipeList(rows)}</div><div class="recipe-divider" data-recipe-resize tabindex="0" role="separator" aria-controls="recipe-list" aria-orientation="vertical" aria-label="调整配方列表宽度" aria-valuemin="${recipeListMinimum}" title="拖动调整配方列表宽度"></div><div class="recipe-detail">${recipeDetails(active)}</div></div>`,
    `${button('close','关闭',null)}<div class="window-actions" data-recipe-actions>${recipeActions(active)}</div>`,'wide-shell recipe-book');
}

function lookupRecipe(item,direction='craft',{target=false,record=true}={}) {
  if (!items.has(item)) return;
  const current=modal?.lookup;
  if (current?.item===item&&current.direction===direction) return;
  if (record&&modal&&['recipes','final-recipes','results'].includes(modal.kind)) {
    recipeTrail.push({modal:{...modal},query:recipeQuery,filter:recipeFilter,tier:recipeTier,active:activeRecipe});
    if (recipeTrail.length>24) recipeTrail.shift();
  } else if (!modal||!['recipes','final-recipes','results'].includes(modal.kind)) recipeTrail.length=0;
  recipeFilter='all'; recipeTier=''; recipeQuery=''; activeRecipe='';
  if (target) {
    const candidates=findItemRecipes(dataset,item,direction);
    const analyzed=reports.get(item)?.steps?.findLast(step=>candidates.some(recipe=>recipe.id===(step.recipe?.id||step.recipe)&&recipe.module==='assembly'));
    activeRecipe=analyzed?.recipe?.id||analyzed?.recipe||candidates.find(recipe=>recipe.module==='assembly')?.id||candidates.find(recipe=>recipe.module!=='conversion')?.id||'';
  }
  openModal('recipes',{lookup:{item,direction}});
}

function recipeBack() {
  const previous=recipeTrail.pop();
  if (!previous) return;
  recipeQuery=previous.query; recipeFilter=previous.filter; recipeTier=previous.tier; activeRecipe=previous.active;
  openModal(previous.modal.kind,previous.modal);
}

function finalRecipesDialog() {
  const batch=modal.batch;
  const rows=[
    ...(batch.combined?[{label:'全部目标 · 合计',recipe:batch.combined,combined:true}]:[]),
    ...batch.entries.map(entry=>({...entry,label:itemName(entry.target.item)})),
  ];
  const row=rows[modal.index]||rows[0];
  const stale=modal.version!==recipeVersion;
  const list=rows.map((entry,index)=>`<button type="button" class="final-recipe-row ${row===entry?'selected':''}" data-action="select-final" data-index="${index}" title="${attr(entry.label)}">${entry.target?asset(itemIcon(items.get(entry.target.item)),'pixel')||icon('target'):icon('box')}<span>${esc(entry.label)}</span><b>${entry.combined?'合计':entry.report.ok?`×${fmt(entry.target.quantity)}`:'待验证'}</b></button>`).join('');
  const issues=row?.report?.issues||[];
  const detail=row?.recipe
    ?`${!row.combined&&!row.report.ok?'<p class="warning-link field-note">该目标尚未通过验证。下方展示已算出的材料方案。</p>':''}${recipeCard(row.recipe)}`
    :'<p class="field-note">当前路线未能形成该目标的完整配方。</p>';
  return modalShell('最终配方',`${batch.entries.length} 个目标`,
    `<div class="final-recipe-layout"><div class="final-recipe-list">${list}</div><div class="recipe-detail"><p class="final-stale field-note" ${stale?'':'hidden'}>工程已修改。重新生成后可查看当前配方。</p><div class="final-data" ${stale?'hidden':''}>${detail}
      ${issues.length?`<div class="final-issues">${issues.map((issue,index)=>`<p>${esc(issue.message)} ${issueLocateButton(issue,index)}</p>`).join('')}</div>`:''}</div></div></div>`,
    `${button('generate-final','重新生成','align')}${button('close','完成',null,{class:'primary'})}`,'wide-shell final-recipe-shell');
}

function refreshRecipeSelection(row) {
  dialog.querySelector('.recipe-detail').innerHTML=recipeDetails(row);
  dialog.querySelector('[data-recipe-actions]').innerHTML=recipeActions(row);
}

function refreshMatchingRecipes() {
  const list=dialog.querySelector('#recipe-list');
  if (!list) return;
  const scroll=list.scrollTop;
  const rows=recipeRows();
  if (!rows.some(row=>row.id===activeRecipe)) activeRecipe=rows[0]?.id||'';
  list.innerHTML=recipeList(rows);
  list.scrollTop=scroll;
  refreshRecipeSelection(rows.find(row=>row.id===activeRecipe));
}

const rulePages = [['colors','颜色'],['items','物品'],['redstone','红石']];

function dyeGrid(rule,key,label) {
  return `<div class="rule-color-side"><small>${label}</small><div class="dye-grid">${DYE_COLORS.map((color,index)=>`<button type="button" class="dye-square ${rule[key]?.includes(index)?'selected':''}" style="--dye:${color.hex}" data-action="rule-color" data-key="${key}" data-index="${index}" title="${esc(color.name)}" aria-label="${esc(color.name)}" aria-pressed="${rule[key]?.includes(index)||false}"></button>`).join('')}</div></div>`;
}

function splitterDialog() {
  const slot=splitterSlot();
  const module=splitterModule();
  if (!module || module.type!=='splitter') return modalShell('纳米组件分流器','','<p>请先选择纳米组件分流器。</p>');
  const rule=module.rules[ruleIndex];
  const switches=rulePages.map(([id,label])=>button('rule-page',label,null,{class:rulePage===id?'pressed':'',data:`data-id="${id}"` })).join('');
  const channel=rule?.redstone?.channel??0;
  const level=rule?.redstone?.level??0;
  const control = rulePage==='redstone'
    ? `<div class="redstone-form">${field('红石频道',select('rule-channel',channel,colors))}${field('最低信号强度',number('rule-level',level,'min="0" max="15" step="1"'))}${field('模拟输入强度',number('rule-signal',module.config?.redstone?.[channel]??0,'min="0" max="15" step="1"'))}</div>`
    : rulePage==='colors'
      ? '<p class="rule-note">勾选允许进入该规则的颜色，以及匹配后可送往的出口。</p>'
      : `<div class="rule-items" data-drop="rule">${(rule?.items||[]).map((entry,index)=>itemTile(entry,{drag:true,action:'rule-item',data:`data-item-context="rule" data-index="${index}"`})).join('')}${'<div class="item-slot item-empty"></div>'.repeat(Math.max(0,16-(rule?.items?.length||0)))}</div>`;
  const ruleTexture=urls(dataset.gui?.rule);
  const slotTexture=urls(dataset.gui?.slot);
  const suggestions=rule?splitterRuleSuggestions(project,dataset,slot,ruleIndex).filter(entry=>!rule.items?.some(mark=>mark.item===entry.item&&!!mark.renamed===!!entry.renamed)):[];
  return modalShell(moduleName('splitter'),slotLabel(slot),
    `<div class="splitter-interface"><div class="splitter-rule-list">${module.rules.map((_,index)=>button('select-rule',`规则 ${index+1}`,null,{class:ruleIndex===index?'pressed':'',data:`data-index="${index}"`})).join('')}${button('add-rule','添加规则','add')}</div>
      ${rule?`<div class="splitter-rule-layout"><div class="splitter-device" style="${ruleTexture?`--rule-art:url('${attr(ruleTexture)}');`:''}${slotTexture?`--slot-art:url('${attr(slotTexture)}');`:''}"><div class="rule-mode">${switches}${button('delete-rule','删除规则','trash',{only:true})}</div><div class="rule-grid">${dyeGrid(rule,'inputs','入口颜色')}<div class="rule-center">${control}</div>${asset(dataset.gui?.arrow,'pixel rule-arrow')||icon('arrow',29)}${dyeGrid(rule,'outputs','出口颜色')}</div></div>
      ${suggestionBox(suggestions,'add-rule-item','','标记入口后显示。')}</div>`:'<div class="splitter-empty">添加一条分流规则以开始配置。</div>'}
      ${rule?`<div class="rule-catalog"><label class="search-field">${icon('search')}<input type="search" data-search="splitter" value="${attr(modal.query||'')}" placeholder="搜索物品或拼音" title="${searchHint}" aria-label="搜索分流物品"></label><div id="rule-catalog-items">${ruleCatalogItems()}</div></div>`:''}
    </div>`,`${button('close','完成',null,{class:'primary'})}`,'splitter-shell');
}

function ruleCatalogItems() {
  return catalogMatches(modal.query||'','all').filter(item=>item.kind!=='fluid').slice(0,24).map(item=>itemTile(item.id,{catalog:true,action:'add-rule-item'})).join('');
}

function issueFocusTarget(issue) {
  if (!issue) return null;
  const route=routeGeometry.get(issue.route);
  if (route?.points.length) return {route,points:route.points,label:routeName(route)};
  const ids=issue.port?[issue.port]:issue.ports||[];
  const ports=ids.map(getPort).filter(port=>port&&Number.isFinite(port.x)&&Number.isFinite(port.y));
  if (ports.length) {
    const first=ports[0];
    const label=ports.length===1?`${kinds[first.kind]||'接口'} ${coordinate(first)}`:`${ports.length} 个相关接口`;
    return {ports,points:ports.map(getPortPosition),label:`${slotName(first.slot)} · ${label}`};
  }
  if (!Number.isInteger(issue.slot)||issue.slot < -1||issue.slot>=project.modules.length) return null;
  return {slot:issue.slot,points:getFootprint(issue.slot).map(([x,y])=>({x,y})),label:slotName(issue.slot)};
}

function issueFocusMarkers({ports,points,slot}) {
  if (ports) return ports.map((port,index)=>{
    const {x,y}=points[index];
    return `<circle class="issue-focus-marker" data-focus-port="${attr(port.id)}" cx="${x}" cy="${y}" r="14"/>`;
  }).join('');
  return slot==null?'':`<polygon class="issue-focus-marker" data-focus-slot="${slot}" points="${points.map(p=>p.x+','+p.y).join(' ')}"/>`;
}

function issueLocateButton(issue,index) {
  return issueFocusTarget(issue)?button('inspect-issue','定位','arrow',{data:`data-index="${index}"`}):'';
}

const reportScrollAreas='.modal-body,.final-recipe-list,.recipe-detail';

function inspectIssue(index) {
  let report=reports.get(project.circuits[activeCircuit]?.item);
  if (modal.kind==='final-recipes') {
    if (modal.version!==recipeVersion) { notify('工程已修改，请重新生成最终配方。',true); return; }
    const entry=(modal.index||0)-(modal.batch.combined?1:0);
    report=modal.batch.entries[entry]?.report;
  }
  const issue=report?.issues[index];
  const target=issueFocusTarget(issue);
  if (!target) { notify('此对象已变更，请重新验证。',true); return; }
  const scroll=[...dialog.querySelectorAll(reportScrollAreas)].map(area=>area.scrollTop);
  issueFocus={target,message:issue.message,camera:{...camera},draft,index,scroll,source:modal};
  draft=null;
  closeModal();
  const xs=target.points.map(p=>p.x),ys=target.points.map(p=>p.y);
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  const side=Math.max(right-left,bottom-top)+4*CELL_SIZE;
  camera={x:(left+right)/2-BOARD_CENTER,y:(top+bottom)/2-BOARD_CENTER,zoom:Math.min(4,(BOARD_SIZE+2*fitPadding)/side)};
  render();
  app.querySelector('[data-action="exit-issue-focus"]').focus({preventScroll:true});
}

function exitIssueFocus() {
  if (!issueFocus) return;
  const previous=issueFocus;
  issueFocus=null;
  dragPan=null;
  draft=previous.draft;
  camera={...previous.camera};
  render();
  // Rendering may fit newly visible fluid badges. On return the original camera wins.
  camera=previous.camera;
  updateView();
  openModal(previous.source.kind,previous.source);
  dialog.querySelector(`[data-action="inspect-issue"][data-index="${previous.index}"]`)?.focus({preventScroll:true});
  [...dialog.querySelectorAll(reportScrollAreas)].forEach((area,index)=>area.scrollTop=previous.scroll[index]||0);
}

function resultsDialog() {
  const target=project.circuits[activeCircuit];
  const report=target && reports.get(target.item);
  const tabs=['验证','耗材','供电','工序'];
  let detail='<p class="muted">请选择目标电路。</p>';
  if (report) {
    if (resultsTab==='验证') {
      detail=`<div class="result-banner ${report.ok?'result-pass':'result-fail'}">${icon(report.ok?'check':'info',24)}<div><b>${report.ok?'路线验证通过':'路线验证有问题'}</b><small>${esc(itemName(target.item))} · 目标 ${fmt(target.quantity)} 个${report.circuit?.produced!=null?` · 预计产出 ${fmt(report.circuit.produced)} 个`:''}</small></div></div>
        <div class="issue-list">${report.issues?.map((issue,index)=>`<div class="issue ${esc(issue.severity)}"><b>${esc(slotName(issue.slot))}</b><span>${esc(issue.message)}</span>${issueLocateButton(issue,index)}</div>`).join('') || '<p class="empty-line muted">没有发现阻塞项。</p>'}</div>`;
    }
    if (resultsTab==='耗材') {
      const materialKey=row=>JSON.stringify([row.item,!!row.renamed]);
      const unit = new Map((report.unitMaterials||[]).map(row=>[materialKey(row),row]));
      const bulk = new Map((report.materials||[]).map(row=>[materialKey(row),row]));
      const material = new Map([...unit,...bulk]);
      detail = `<table class="result-table"><thead><tr><th ${headingHint('★ 表示在图纸中标记为重命名。')}>物料</th><th ${headingHint('单件用量按制作 1 个时实际启动的批次计算。')}>制作 1 个</th><th>本单合计</th></tr></thead><tbody>${[...material].map(([key,row])=>`<tr><td>${itemTile({item:row.item,renamed:row.renamed})}<span>${esc(itemName(row.item))}</span></td><td>${unit.has(key)?volume(row.item,unit.get(key).amount):'—'}</td><td>${bulk.has(key)?volume(row.item,bulk.get(key).amount):'—'}</td></tr>`).join('')||'<tr><td colspan="3">暂时没有可统计的物料。</td></tr>'}</tbody></table>
        ${report.omitted?.length?`<details><summary>排除项（${report.omitted.length}）</summary>${report.omitted.map(row=>`<div class="issue"><b>${esc(slotName(row.slot))}</b><span>${esc(itemName(row.item))}${row.amount==null?'':` × ${volume(row.item,row.amount)}`} · ${esc(row.reason)}</span></div>`).join('')}</details>`:''}`;
    }
    if (resultsTab==='供电') {
      const power=report.recommendation;
      detail=power ? `<div class="power-result"><div><small ${headingHint('按配方批量、模块增益和电压搜索 1%–99% 的可选比例。')}>建议 · 组装矩阵 / 其他</small><strong>${fmt(power.ratio)} : ${fmt(power.otherRatio??100-power.ratio)}</strong></div><div><small>瓶颈加工估时</small><strong>${fmt(power.ticks/20)} <small>秒</small></strong></div><div><small ${headingHint('工程当前采用的组装矩阵与其他加工组件的供电比例。')}>当前比例</small><strong>${project.power.ratio} : ${100-project.power.ratio}</strong></div></div>
        <div class="control-actions">${button('apply-ratio','应用建议比例','check',{class:'primary',data:`data-value="${Number(power.ratio)}"`})}${button('power','手动设定','power')}</div>
        <table class="result-table"><thead><tr><th>结构</th><th>分配功率</th></tr></thead><tbody>${Array.isArray(power.allocations)?power.allocations.map(row=>`<tr><td>${esc(slotName(row.slot))}</td><td>${fmt(row.power??row.eu??row.eut??row.capacity)} EU/t</td></tr>`).join(''):''}</tbody></table>`
        : `<p class="field-note">请补齐验证页列出的条件后重新计算供电比例。</p>${button('power','填写供电参数','power')}`;
    }
    if (resultsTab==='工序') detail = report.steps?.map((step,index)=>`<details ${index===0?'open':''}><summary><b>${esc(slotName(step.slot))}</b> · ${fmt(step.batches)} 批</summary>${recipeCard(typeof step.recipe==='object'?step.recipe:recipes.get(step.recipe))}</details>`).join('') || '<p class="muted">尚未计算出工序。</p>';
  }
  return modalShell('电路分析',target?itemName(target.item):'尚无目标电路',
    `<div class="analysis-tabs">${tabs.map(tab=>button('result-tab',tab,null,{class:tab===resultsTab?'pressed':'',data:`data-value="${tab}"`})).join('')}${project.circuits.length>1?select('active-target',activeCircuit,project.circuits.map((entry,index)=>[index,itemName(entry.item)])):''}</div><div class="analysis-body">${detail}</div>`,
    `${button('remove-target','移除目标','trash',{disabled:!target})}${button('close','完成',null,{class:'primary'})}`,'wide-shell');
}

function fileList(rows,kind) {
  if (!rows.length) return '<p class="muted empty-line">暂无记录。</p>';
  const defaultLabel = kind==='open-folder-file' ? '本地文件' : '示例图纸';
  return `<div class="file-list">${rows.map(row=>`<button type="button" data-action="${kind}" data-id="${attr(row.id||row.key)}"${row.fileKey?` data-file-key="${attr(row.fileKey)}"`:''}>${icon(kind==='restore'?'history':'folder')}<b>${esc(row.name)}</b><span>${esc(row.updatedAt||row.savedAt?new Date(row.updatedAt||row.savedAt).toLocaleString('zh-CN',{hour12:false}):defaultLabel)}</span></button>`).join('')}</div>`;
}

function operationDialog() {
  const {entries,cursor,trimmed}=operationHistory;
  const rows=[{label:trimmed?'最早保留状态':'起始状态'},...entries];
  return modalShell('操作历史',`当前工程最多保留 ${HISTORY_LIMIT} 步。选择一项可回到对应状态。`,
    `<ol class="operation-list" reversed aria-label="工程操作记录">${rows.map(({label,time},index)=>{
      const stamp=time?new Date(time).toLocaleTimeString('zh-CN',{hour12:false}):'';
      return `<li><button type="button" class="operation-entry${index>cursor?' operation-future':''}" data-action="seek-operation" data-index="${index}" ${index===cursor?'aria-current="step"':''}><span class="operation-index">${index||'—'}</span><b>${esc(label)}</b>${stamp?`<time datetime="${attr(new Date(time).toISOString())}">${esc(stamp)}</time>`:''}</button></li>`;
    }).reverse().join('')}</ol>`,
    `<div class="history-tools" role="group" aria-label="历史导航">${historyButtons()}</div>${button('close','关闭')}`,'operations-shell');
}

function renderModal() {
  if (!modal) return;
  hideTooltip();
  const footer = button('close','关闭',null);
  switch (modal.kind) {
    case 'modules': dialog.innerHTML=modulePicker(); break;
    case 'power': dialog.innerHTML=powerDialog(); break;
    case 'recipes': dialog.innerHTML=recipeDialog(); break;
    case 'final-recipes': dialog.innerHTML=finalRecipesDialog(); break;
    case 'splitter': dialog.innerHTML=splitterDialog(); break;
    case 'results': dialog.innerHTML=resultsDialog(); break;
    case 'open': {
      const localOpen=webEdition||portableEdition;
      const folderPicker=portableEdition||(webEdition&&typeof window.showDirectoryPicker==='function');
      const folder=portableEdition&&projectDirectory
        ? `<p class="muted" style="overflow-wrap:anywhere">${esc(projectDirectory)}</p>` : '';
      const conversion=portableEdition
        ? `<p>${button('convert-html-project','将 HTML 工程转为 .nac','upload')}</p>` : '';
      dialog.innerHTML=modalShell('打开工程',modal.hint || (webEdition?'浏览器中的工程':'每个工程的图纸、操作历史与备份保存在同一个文件中'),
        folder+fileList(modal.rows,'load-project')+conversion,
        `${button('import-project',localOpen?'打开本地工程':'导入工程文件','folder')}${folderPicker?button('open-folder','选择工程文件夹','folder'):''}${footer}`);
      break;
    }
    case 'project-folder': dialog.innerHTML=modalShell('工程文件夹',modal.name,fileList(modal.rows,'open-folder-file'),footer); break;
    case 'history': dialog.innerHTML=modalShell('工程备份',project.name,fileList(modal.rows,'restore'),`${button('save','保存恢复点','save')}${footer}`); break;
    case 'operations': dialog.innerHTML=operationDialog(); break;
    case 'new': dialog.innerHTML=modalShell('新建工程','创建独立的设计图纸',`<form id="new-form">${field('工程名称','<input name="name" maxlength="100" required placeholder="例如 光学专用 NAC">')}</form>`,`${footer}<button type="submit" form="new-form" class="primary">创建工程</button>`); break;
    case 'preferences': dialog.innerHTML=preferencesDialog(); break;
    case 'rename-route': {
      const route=getRoute(modal.id);
      dialog.innerHTML=modalShell('线路名称','',`<form id="route-name-form">${field('名称',`<input name="route-name" maxlength="64" value="${attr(routeName(route))}" required autofocus>`)}</form>`,
        `${footer}<button type="submit" form="route-name-form" class="primary">保存</button>`);
      dialog.querySelector('input')?.select();
      break;
    }
    case 'notes': dialog.innerHTML=modalShell('工程备注',project.name,`<textarea data-field="notes" rows="6" aria-label="工程备注" placeholder="记录外部加工、建设要求和调整说明">${esc(project.notes)}</textarea>`,footer); break;
    case 'examples': dialog.innerHTML=modalShell('示例工程','打开时生成一份独立副本',fileList(modal.rows,'load-example'),footer); break;
    case 'arrange': dialog.innerHTML=arrangeDialog(); bindArrangePreview(); break;
    case 'confirm': dialog.innerHTML=modalShell(modal.title,'',`<p>${esc(modal.message)}</p>`,`${footer}${button('confirm','确认',null,{class:'danger'})}`); break;
    case 'help': dialog.innerHTML=modalShell('使用帮助','',`<ol class="help-list"><li><b>安装结构</b> 点击任一空槽。右键底板方块可新建端口。</li><li><b>移动接口</b> 左键拖动接口。Ctrl+点击可选中同一组件上的一组接口，拖动其中一个即可整组平移。右键可固定或解锁单个接口或整组。</li><li><b>布线</b> 选中端口，在右栏点「新建线路」，也可以右键端口开始。点击接线或放置线头，Ctrl+点击加折点，Backspace 撤回最近添加的折点。默认吸附格子中心，Shift 可自由定位，靠近端口仍会自动锚定。</li><li><b>编辑线路</b> 滚轮以鼠标所在位置缩放。拖动线段或空心端点可调整走线。右键可改名、下沉、固定或删除线路。整理时可勾选「同时整理接口」。</li><li><b>快捷键</b> ${preferences.shortcuts.book} 打开合成表，${preferences.shortcuts.target} 选择目标配方，${preferences.shortcuts.items} 打开物品目录。在主题与快捷键中可修改。</li><li><b>撤销与重做</b> Ctrl+Z 撤销，Ctrl+Y 或 Ctrl+Shift+Z 重做。工具栏的「操作历史」可直接跳到某一步。</li><li><b>保存</b> ${webEdition?'编辑时会在浏览器中自动保存。双击保存的 HTML 可在网站打开该工程。在 Chrome 或 Edge 中首次 Ctrl+S 时选择原 HTML，可授权写回。其他浏览器可下载 HTML 工程。':'工程自动保存。Ctrl+S 创建恢复点。'}</li></ol>`,footer); break;
    case 'about': dialog.innerHTML=modalShell('数据来源与版本','GTNH 2.9.0 正式版',`<div class="about-data"><p>内置 ${fmt(dataset.recipes.length)} 条配方，${fmt(dataset.items.length)} 项物品。原版 GTNH 的配方和资源按版本导入。</p><p>本地工程目录 <code>${esc(projectDirectory||'浏览器本地恢复')}</code></p><p><a href="https://gtnh.huijiwiki.com/wiki/NAC" target="_blank" rel="noreferrer">GTNH 中文 Wiki</a>　<a href="https://github.com/GTNewHorizons/GT5-Unofficial/tree/5.09.54.265" target="_blank" rel="noreferrer">GT5-Unofficial</a>　<a href="https://github.com/GTNewHorizons/NewHorizonsCoreMod/tree/2.9.99" target="_blank" rel="noreferrer">NewHorizonsCoreMod</a></p>${startupWarning?`<p class="warning-link">${esc(startupWarning)}</p>`:''}</div>`,footer); break;
    default: closeModal();
  }
  if (dialog.open&&modal) positionWindow(dialog,dialogLayouts.get(modal.kind));
}

function arrangeExtent(before,after) {
  let left=BOARD_MIN,top=BOARD_MIN,right=BOARD_MAX,bottom=BOARD_MAX;
  for (const geometry of [before,after]) for (const route of geometry) for (const {x,y} of route.points) {
    left=Math.min(left,x); top=Math.min(top,y); right=Math.max(right,x); bottom=Math.max(bottom,y);
  }
  return {x:(left+right)/2,y:(top+bottom)/2,width:right-left+2*fitPadding,height:bottom-top+2*fitPadding};
}

function createArrangePreview(previous) {
  const before=buildRoutes(project);
  const beforePorts=project.ports.map(port=>({...port}));
  const fit=arrangeExtent(before,before);
  const plates=Array.from({length:13},(_,index)=>`<polygon class="arrange-plate ${index===0||project.modules[index-1]?'installed':''}" points="${getFootprint(index-1).map(pair=>pair.join(',')).join(' ')}"/>`).join('');
  return {before,after:before,beforePorts,afterPorts:beforePorts,movedPorts:new Set(),fit,viewFit:previous?.viewFit??fit,
    camera:previous?.camera??{x:fit.x,y:fit.y,zoom:1},plates};
}

function arrangePortMarkup(port,moved,original) {
  const {x,y}=getPortPosition(port);
  const direction={ n:'M0 4V-4m-3 3 3-3 3 3',e:'M-4 0H4M1-3l3 3-3 3',s:'M0-4v8m-3-3 3 3 3-3',w:'M4 0h-8m3-3-3 3 3 3',up:'M-4 0h8M0-4v8',down:'M-4 0h8' }[port.facing];
  return `<g class="arrange-port${moved?' arrange-port-moved':''}" data-arrange-port="${attr(port.id)}" transform="translate(${x} ${y})"><title>${esc(kinds[port.kind])} ${coordinate(port)}${port.locked===true?' · 接口固定':moved?(original?' · 拟移动的原位置':' · 整理后位置'):''}</title>
    <rect x="-7" y="-7" width="14" height="14" rx="${isInput(port)?4:2}" fill="${dye(port.color).hex}"/>${direction?`<path class="arrange-port-direction" d="${direction}"/>`:''}</g>`;
}

function arrangeSceneMarkup(preview,original) {
  const geometry=original?preview.before:preview.after;
  const cuts=routeCutouts(geometry);
  const masks=routeMasks(geometry,cuts,'arrange');
  const ports=original?preview.beforePorts:preview.afterPorts;
  return `<defs>${masks.defs}</defs>${preview.plates}
    ${geometry.map(route=>`<g class="${route.returning?'route-return':''}">${routePaint(route,routeInk(route.displayColorIndex),masks.ids.get(route.id),cuts.get(route.id))}</g>`).join('')}
    ${ports.map(port=>arrangePortMarkup(port,preview.movedPorts.has(port.id),original)).join('')}`;
}

function updateArrangeView(svg=dialog.querySelector('.arrange-board')) {
  if (!svg?.clientWidth || !svg.clientHeight || modal?.kind!=='arrange' || !modal.preview) return;
  const {viewFit,camera}=modal.preview;
  const aspect=svg.clientWidth/svg.clientHeight;
  const height=Math.max(viewFit.width/aspect,viewFit.height)/camera.zoom;
  const width=height*aspect;
  const box=[camera.x-width/2,camera.y-height/2,width,height];
  svg.setAttribute('viewBox',box.join(' '));
  const surface=svg.querySelector('[data-arrange-grid]');
  ['x','y','width','height'].forEach((key,index)=>surface.setAttribute(key,box[index]));
  dialog.querySelector('[data-arrange-zoom]').textContent=`${Math.round(camera.zoom*100)}%`;
}

function zoomArrange(factor,point=null) {
  const camera=modal?.preview?.camera;
  if (modal?.kind!=='arrange' || !camera) return;
  const zoom=Math.max(.25,Math.min(8,camera.zoom*factor));
  if (point) {
    const ratio=camera.zoom/zoom;
    camera.x=point.x+(camera.x-point.x)*ratio;
    camera.y=point.y+(camera.y-point.y)*ratio;
  }
  camera.zoom=zoom;
  updateArrangeView();
}

function fitArrange() {
  if (modal?.kind!=='arrange' || !modal.preview) return;
  const {fit,camera}=modal.preview;
  modal.preview.viewFit=fit;
  Object.assign(camera,{x:fit.x,y:fit.y,zoom:1});
  updateArrangeView();
}

function switchArrangeView(id) {
  if (modal?.kind!=='arrange' || !modal.preview) return;
  modal.original=id==='before';
  const svg=dialog.querySelector('.arrange-board');
  if (!svg) return;
  svg.querySelector('[data-arrange-scene]').innerHTML=arrangeSceneMarkup(modal.preview,modal.original);
  svg.setAttribute('aria-label',modal.original?'当前线路图纸':'整理后的线路图纸');
  for (const tab of dialog.querySelectorAll('[data-action="arrange-view"]')) {
    const active=tab.dataset.id===id;
    tab.classList.toggle('pressed',active);
    tab.setAttribute('aria-pressed',String(active));
  }
}

const arrangeResizeObserver = new ResizeObserver(()=>updateArrangeView());
arrangeResizeObserver.observe(dialog);

function bindArrangePreview() {
  const svg=dialog.querySelector('.arrange-board');
  if (!svg) return;
  const {camera}=modal.preview;
  let drag=null;
  updateArrangeView(svg);
  svg.addEventListener('wheel',event=>{
    const matrix=svg.getScreenCTM();
    if (!matrix || !event.deltaY) return;
    event.preventDefault();
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    zoomArrange(event.deltaY<0?1.12:1/1.12,point);
  },{passive:false});
  svg.addEventListener('pointerdown',event=>{
    if (drag || (event.button!==0 && event.button!==1)) return;
    const matrix=svg.getScreenCTM();
    if (!matrix?.a) return;
    event.preventDefault();
    hideTooltip();
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,originX:camera.x,originY:camera.y,scale:1/matrix.a};
    svg.setPointerCapture(event.pointerId);
    svg.classList.add('is-panning');
  });
  svg.addEventListener('pointermove',event=>{
    if (drag?.id!==event.pointerId) return;
    camera.x=drag.originX-(event.clientX-drag.x)*drag.scale;
    camera.y=drag.originY-(event.clientY-drag.y)*drag.scale;
    updateArrangeView(svg);
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) svg.addEventListener(type,event=>{
    if (drag?.id!==event.pointerId) return;
    drag=null;
    svg.classList.remove('is-panning');
  });
}

const arrangeWeightLabels = { overlap:'减少同层重叠',ground:'优先走基面',bends:'减少折弯' };
const arrangeWeightHelp = '数值越大越优先，0 表示不计分。三项不必合计 100。同层交叉一格也算重叠；跨层交叉和重叠都不计，同一端口必需的共用引线也不计。';
const weightsEqual = (a,b) => Object.keys(arrangeWeightLabels).every(key=>a[key]===b[key]);
const noArrangeWeights = state => Object.values(state.weights).every(value=>value===0);
const hasArrangementChanges = result => !!(result?.changed||result?.movedPorts);

function arrangeHelp(state) {
  const counts=state.result;
  return `滚轮缩放，左键拖动平移。两版图纸共享视角。${counts?`${counts.changed} 条线路将调整，${counts.locked} 条固定，${counts.loose} 条未接端点。`:''}${state.arrangePorts?'描边高亮的接口会移动。':''}`;
}

function arrangeStatus(state) {
  if (state.error) return state.error;
  if (state.pending) return state.arrangePorts?'正在联合整理线路和接口…':'正在计算整理方案…';
  if (noArrangeWeights(state)) return '三项权重均为 0，图纸保持原样。';
  if (!hasArrangementChanges(state.result)) return '本次没有找到更合适的方案。';
  return '';
}

function arrangeComparison(state) {
  const {result,preview,pending,error}=state;
  const metrics=[
    ['同层重叠（格）', value=>value.sameLayerConflict],
    ['基面线路', value=>preview.before.length-value.belowGround],
    ['折点', value=>value.bends],
  ];
  const ready=result&&!pending&&!error;
  return metrics.map(([label,read])=>`<tr><th scope="row">${label}</th><td>${fmt(result&&read(result.before))}</td><td>${fmt(ready?read(result.after):null)}</td></tr>`).join('')
    +(state.arrangePorts?`<tr><th scope="row">移动接口</th><td>0</td><td>${fmt(ready?result.movedPorts:null)}</td></tr>`:'');
}

function updateArrangeSummary(state=modal) {
  if (state?.kind!=='arrange') return;
  const rows=dialog.querySelector('[data-arrange-metrics]');
  if (!rows) return;
  rows.innerHTML=arrangeComparison(state);
  const status=dialog.querySelector('[data-arrange-status]');
  status.textContent=arrangeStatus(state);
  status.classList.toggle('arrange-error',!!state.error);
  dialog.querySelector('[data-action="apply-arrange"]').disabled=state.pending||!!state.error||!hasArrangementChanges(state.result);
  const title=dialog.querySelector('.window-heading h2');
  title.dataset.tipHeading=arrangeHelp(state);
  title.setAttribute('aria-description',title.dataset.tipHeading);
}

function stopArrangeWork(state) {
  if (state?.kind!=='arrange') return;
  clearTimeout(state.timer);
  state.request?.abort();
  state.request=null;
}

function arrangementPortCandidates() {
  const slots=new Map();
  const candidates=Object.create(null);
  for (const port of project.ports) {
    if (!slots.has(port.slot)) {
      const cells=[];
      for (let y=0;y<7;y++) for (let x=0;x<7;x++) {
        if (canPlace(port.slot,x,y)) cells.push({x,y});
      }
      slots.set(port.slot,cells);
    }
    candidates[port.id]=slots.get(port.slot);
  }
  return candidates;
}

function queueArrangement(delay=0) {
  const state=modal;
  if (state?.kind!=='arrange') return;
  stopArrangeWork(state);
  state.pending=true;
  state.error='';
  const task=new AbortController();
  state.request=task;
  const current=()=>modal===state&&state.request===task&&state.version===version&&!task.signal.aborted;
  updateArrangeSummary(state);
  state.timer=setTimeout(async()=>{
    try {
      const {requestArrangement}=await import('./arrange.js');
      if (!current()) return;
      const options={weights:state.weights,arrangePorts:state.arrangePorts};
      if (state.arrangePorts) options.portCandidates=arrangementPortCandidates();
      const result=await requestArrangement(project,options,{signal:task.signal});
      if (!current()) return;
      const beforePorts=new Map(state.preview.beforePorts.map(port=>[port.id,port]));
      state.preview.afterPorts=result.ports??state.preview.beforePorts;
      state.preview.movedPorts=new Set(state.preview.afterPorts.filter(port=>{
        const original=beforePorts.get(port.id);
        return original&&(original.x!==port.x||original.y!==port.y);
      }).map(port=>port.id));
      state.preview.after=buildRoutes({...project,ports:state.preview.afterPorts,routes:result.routes});
      state.preview.fit=arrangeExtent(state.preview.before,state.preview.after);
      state.result=result;
      switchArrangeView(state.original?'before':'after');
    } catch (error) {
      if (current()&&error.name!=='AbortError') state.error=error.message||'布线整理失败。';
    } finally {
      if (current()) {
        state.pending=false;
        state.request=null;
        updateArrangeSummary(state);
      }
    }
  },delay);
}

function refreshArrangementProject() {
  modal.version=version;
  modal.result=null;
  modal.preview=createArrangePreview(modal.preview);
  switchArrangeView(modal.original?'before':'after');
  updateArrangeView();
  queueArrangement(180);
}

function setArrangeWeights(values) {
  if (modal?.kind!=='arrange') return;
  const next=normalizeArrangeWeights(values);
  if (weightsEqual(next,modal.weights)) return;
  modal.weights=arrangeWeights=next;
  localStorage.setItem(arrangeWeightKey,JSON.stringify(arrangeWeights));
  for (const control of dialog.querySelectorAll('[data-arrange-weight]')) {
    const key=control.dataset.arrangeWeight;
    if (Number(control.value)!==next[key]) control.value=next[key];
    dialog.querySelector(`[data-arrange-weight-value="${key}"]`).textContent=next[key];
  }
  dialog.querySelector('[data-action="reset-arrange-weights"]').disabled=weightsEqual(next,DEFAULT_ARRANGE_WEIGHTS);
  queueArrangement(230);
}

function setArrangePorts(value) {
  if (modal?.kind!=='arrange'||modal.arrangePorts===value) return;
  modal.arrangePorts=arrangePorts=value;
  localStorage.setItem(arrangePortsKey,String(value));
  queueArrangement();
}

function arrangeDialog() {
  const showOriginal=modal.original;
  const preview=modal.preview;
  const weights=Object.entries(arrangeWeightLabels).map(([key,label])=>`<label class="arrange-weight"><span>${label}</span><output data-arrange-weight-value="${key}" aria-hidden="true">${modal.weights[key]}</output><input type="range" min="0" max="100" step="1" data-arrange-weight="${key}" value="${modal.weights[key]}" aria-label="${label}"></label>`).join('');
  return modalShell('整理布线',arrangeHelp(modal),`<div class="arrange-layout"><div class="arrange-canvas"><div class="arrange-tools">
    <div class="arrange-tabs">${button('arrange-view','当前图纸',null,{class:showOriginal?'pressed':'',data:`data-id="before" aria-pressed="${!!showOriginal}"`})}${button('arrange-view','整理预览',null,{class:showOriginal?'':'pressed',data:`data-id="after" aria-pressed="${!showOriginal}"`})}</div>
    <div class="arrange-zoom" role="group" aria-label="预览缩放">${button('arrange-zoom-out','缩小预览','minus',{only:true})}<output data-arrange-zoom>${Math.round(preview.camera.zoom*100)}%</output>${button('arrange-zoom-in','放大预览','add',{only:true})}${button('arrange-zoom-fit','预览适合窗口','fit',{only:true})}</div></div>
    <svg class="arrange-board" role="img" aria-label="${showOriginal?'当前线路图纸':'整理后的线路图纸'}"><defs>${draftingGridPattern('arrange-grid')}</defs>
      <rect data-arrange-grid fill="url(#arrange-grid)"/><g data-arrange-scene>${arrangeSceneMarkup(preview,showOriginal)}</g>
    </svg></div>
    <div class="arrange-summary"><section class="arrange-weights" aria-labelledby="arrange-weight-heading">
      <div class="arrange-weight-heading"><h3 id="arrange-weight-heading" ${headingHint(arrangeWeightHelp)}>整理权重</h3>${button('reset-arrange-weights','重置',null,{tip:'恢复默认权重',disabled:weightsEqual(modal.weights,DEFAULT_ARRANGE_WEIGHTS)})}</div>${weights}
      <label class="toggle arrange-ports-toggle" title="允许移动同一组件内的已接线接口。固定接口、固定线路及未接线头保留位置。"><input type="checkbox" data-arrange-ports ${modal.arrangePorts?'checked':''}><span>同时整理接口</span></label></section>
      <table class="result-table"><thead><tr><th scope="col">比较项</th><th scope="col">当前</th><th scope="col">整理后</th></tr></thead><tbody data-arrange-metrics>${arrangeComparison(modal)}</tbody></table>
      <p data-arrange-status role="status" class="arrange-status${modal.error?' arrange-error':''}">${esc(arrangeStatus(modal))}</p></div></div>`,
    `${button('close','取消')}${button('apply-arrange','应用整理','check',{class:'primary',disabled:modal.pending||!!modal.error||!hasArrangementChanges(modal.result)})}`,'arrange-shell');
}

function preferencesDialog() {
  return modalShell('主题与快捷键','设置保存在本机。V 选择 · R 布线 · H 平移 · F 适合窗口 · Ctrl+S 保存 · Ctrl+Z 撤销 · Ctrl+Y 重做',`<div class="preferences-layout">
    ${field('外观',select('theme',preferences.theme,[['system','跟随系统'],['light','浅色'],['dark','深色']]))}
    ${Object.entries(shortcutLabels).map(([key,label])=>field(label,`<input data-field="shortcut-${key}" maxlength="1" autocomplete="off" spellcheck="false" value="${preferences.shortcuts[key]}">`)).join('')}
    </div>`,`${button('reset-shortcuts','恢复默认快捷键')}${button('close','完成',null,{class:'primary'})}`);
}

function structureSlice(info,layer) {
  const structure=info?.structure;
  const transpose = rows => rows?.[0]?.map((_,index)=>rows.map(row=>row[index])) || [];
  const layers = structure?.controlRoom || [...transpose(structure?.base),...transpose(structure?.upper)];
  const layerIndex = Math.max(0,Math.min(layers.length-1,layer));
  const selected = layers[layerIndex];
  const draw = Array.isArray(selected) && selected.every(line=>typeof line==='string');
  return `<div class="structure-layout">${asset(info?.front||info?.preview||info?.icon,'pixel structure-preview')}
      <div>${draw?`${field('结构切片',select('structure-layer',layerIndex,layers.map((_,index)=>[index,`第 ${index+1} 层`])))}<div class="structure-grid" style="--cols:${Math.max(...selected.map(line=>line.length))}">${selected.flatMap(line=>Array.from(line)).map(character=>`<span class="structure-block ${character===' '?'air':''}" title="${attr(structure?.blocks?.[character]?.name||structure?.blocks?.[character]||character)}">${character===' '?'':asset(structure?.blocks?.[character]?.icon,'pixel')||esc(character)}</span>`).join('')}</div>`:''}
      <ul>${Object.entries(structure?.blocks||{}).map(([key,value])=>`<li><b>${esc(key)}</b>　${esc(value?.name||value)}</li>`).join('')}</ul></div></div>
      ${info?.wiki?`<a href="${attr(info.wiki.startsWith('https://gtnh.huijiwiki.com/')?info.wiki:'#')}" target="_blank" rel="noreferrer">查看中文 Wiki 结构图</a>`:''}`;
}

function positionWindow(panel,state) {
  if (!state) return;
  const width=state.width?Math.min(state.width,innerWidth-8):0;
  const height=state.height?Math.min(state.height,innerHeight-8):0;
  panel.style.width=width?`${width}px`:'';
  panel.style.height=height?`${height}px`:'';
  panel.classList.toggle('window-sized',!!width);
  panel.classList.toggle('is-locked',state.locked);
  panel.style.removeProperty('--window-remaining');
  if (state.anchorSlot!=null) {
    const anchor=projectedPlatform(state.anchorSlot);
    if (anchor) Object.assign(state,adjacentWindowPosition(anchor,{width:panel.offsetWidth,height:panel.offsetHeight},{width:innerWidth,height:innerHeight}));
    delete state.anchorSlot;
  }
  if (!Number.isFinite(state.x)) state.x=Math.round((innerWidth-panel.offsetWidth)/2);
  if (!Number.isFinite(state.y)) state.y=Math.round((innerHeight-panel.offsetHeight)/2);
  const x=Math.max(4,Math.min(state.x,innerWidth-panel.offsetWidth-4));
  let y;
  if (state.locked) {
    y=Math.max(4,Math.min(state.y,innerHeight-85));
    panel.style.setProperty('--window-remaining',`${innerHeight-y-4}px`);
  } else {
    y=Math.max(4,Math.min(state.y,innerHeight-panel.offsetHeight-4));
    Object.assign(state,{x,y});
  }
  Object.assign(panel.style,{left:`${x}px`,top:`${y}px`,zIndex:state.z});
  if (panel===dialog) updateRecipeDivider();
}

function projectedPlatform(slot) {
  const svg=app.querySelector('#diagram');
  const matrix=svg?.getScreenCTM();
  if (!matrix) return null;
  const {x,y,width,height}=getPlatform(slot);
  const start=new DOMPoint(x,y).matrixTransform(matrix);
  const end=new DOMPoint(x+width,y+height).matrixTransform(matrix);
  const board=svg.getBoundingClientRect();
  const clipX=value=>Math.max(board.left,Math.min(board.right,value));
  const clipY=value=>Math.max(board.top,Math.min(board.bottom,value));
  return {left:clipX(start.x),right:clipX(end.x),top:clipY(start.y),bottom:clipY(end.y)};
}

function windowPin(action,state,data='') {
  const locked=!!state?.locked;
  return button(action,locked?'解除位置锁定':'锁定窗口位置',locked?'lock':'unlock',
    {only:true,data:`${data} aria-pressed="${locked}" data-window-pin`});
}

const resizeGrip = () => '<div class="window-resize" data-window-resize title="拖动改变窗口大小" aria-hidden="true"></div>';

function renderStructures() {
  for (const panel of [...floatingWindows.children]) {
    if (panel.hasAttribute('data-structure-window')&&!structureWindows.has(Number(panel.dataset.structureWindow))) panel.remove();
  }
  for (const [slot,state] of structureWindows) {
    const module=project.modules[slot];
    const info=slot===-1?dataset.core:modules.get(module?.type);
    if (slot!==-1&&!module) { structureWindows.delete(slot); floatingWindows.querySelector(`[data-structure-window="${slot}"]`)?.remove(); continue; }
    let panel=floatingWindows.querySelector(`[data-structure-window="${slot}"]`);
    if (!panel) {
      panel=document.createElement('section');
      panel.className='structure-window';
      panel.dataset.structureWindow=slot;
      panel.setAttribute('role','dialog');
      panel.setAttribute('aria-modal','false');
      floatingWindows.append(panel);
    }
    panel.setAttribute('aria-label',`结构详情 · ${slotName(slot)}`);
    const slotData=`data-slot="${slot}"`;
    const contents=`<header class="structure-window-head" data-window-grip><div class="window-heading"><b>${esc(slot===-1?'主体控制室':moduleName(module?.type))}</b>${slot===-1?'':`<span>${slotLabel(slot)}</span>`}</div>
      <div class="window-actions">${windowPin('lock-structure',state,slotData)}${button('close-structure','关闭结构详情','close',{only:true,data:slotData})}</div></header>
      ${module?`<nav class="structure-window-tabs">${button('structure-tab','结构属性',null,{class:state.tab==='properties'?'pressed':'',data:`${slotData} data-id="properties"`})}${button('structure-tab','结构切片',null,{class:state.tab==='layers'?'pressed':'',data:`${slotData} data-id="layers"`})}</nav>`:''}
      <div class="structure-window-body">${state.tab==='properties'&&module?moduleControls(module,slot):structureSlice(info,state.layer)}</div>${resizeGrip()}`;
    if (state.markup!==contents) {
      const scroll=panel.querySelector('.structure-window-body')?.scrollTop||0;
      panel.innerHTML=contents;
      panel.querySelector('.structure-window-body').scrollTop=scroll;
      state.markup=contents;
    }
    positionWindow(panel,state);
  }
}

function openStructure(slot) {
  if (slot!==-1&&!project.modules[slot]) return;
  let state=structureWindows.get(slot);
  if (!state) {
    state={anchorSlot:slot,locked:false,tab:slot===-1?'layers':'properties',layer:0,markup:''};
    structureWindows.set(slot,state);
  }
  state.z=++windowZ;
  closeContext();
  renderStructures();
}

function openPortWindow(port) {
  if (!isOutput(port)) return;
  const state=portWindows.get(port.id)||{locked:false,page:0,markup:''};
  state.z=++windowZ;
  portWindows.set(port.id,state);
  renderPortWindows();
}

function renderPortWindows() {
  for (const panel of floatingWindows.querySelectorAll('[data-port-window]')) {
    if (!portWindows.has(panel.dataset.portWindow)) panel.remove();
  }
  for (const [id,state] of portWindows) {
    const port=getPort(id);
    let panel=floatingWindows.querySelector(`[data-port-window="${CSS.escape(id)}"]`);
    if (!isOutput(port)) { portWindows.delete(id); panel?.remove(); continue; }
    if (!panel) {
      panel=document.createElement('section');
      panel.className='port-window';
      panel.dataset.portWindow=id;
      panel.setAttribute('role','dialog');
      panel.setAttribute('aria-label','真空输出口物品标记');
      floatingWindows.append(panel);
    }
    const owner=`data-port-owner="${attr(id)}"`;
    const lastPage=Math.max(0,Math.ceil(port.items.length/16)-1);
    state.page=Math.max(0,Math.min(lastPage,state.page));
    const offset=state.page*16;
    const slots=port.items.slice(offset,offset+16);
    const title=port.kind==='feed'?'主体真空输出口标记':'真空输出口物品标记';
    const contents=`<header class="structure-window-head" data-window-grip><div class="window-heading"><b>${title}</b><span>${coordinate(port)}</span></div><div class="window-actions">${windowPin('lock-port-window',state,owner)}${button('close-port-window','关闭端口物品标记','close',{only:true,data:owner})}</div></header>
      <div class="port-window-body"><div><div class="me-grid" data-drop="port" ${owner} aria-label="4 × 4 物品标记格">${slots.map((entry,index)=>portMarkTile(port,entry,offset+index)).join('')}${'<div class="item-slot item-empty"></div>'.repeat(16-slots.length)}</div>
      ${lastPage?`<div class="window-actions port-pages">${button('port-page','上一页','collapse',{only:true,disabled:state.page===0,data:`${owner} data-value="-1"`})}<small>${state.page+1} / ${lastPage+1}</small>${button('port-page','下一页','expand',{only:true,disabled:state.page===lastPage,data:`${owner} data-value="1"`})}</div>`:''}</div>
      <div class="port-window-suggestions">${portSuggestions(port,'可从合成表或物品栏拖入。')}${port.kind==='out'?button('return-to-core','接回控制室','arrow',{data:`data-port="${attr(id)}"`}):''}</div></div>${resizeGrip()}`;
    if (state.markup!==contents) { panel.innerHTML=contents; state.markup=contents; }
    positionWindow(panel,state);
  }
}

const getPort = id => project.ports.find(port=>port.id===id);
const getRoute = id => project.routes.find(route=>route.id===id);
const findCellPort = (slot,x,y) => project.ports.find(port=>port.slot===slot&&port.x===x&&port.y===y);
const routeName = route => route?.name || `线路 ${Math.max(1,project.routes.findIndex(entry=>entry.id===route?.id)+1)}`;
const routeInk = index => index===0 ? 'var(--black-wire)' : index===15 ? 'var(--white-wire)' : dye(index).hex;

function closeContext() {
  contextMenu.hidden=true;
  menuState=null;
}

const menuButton = (action,label,glyph,options={}) =>
  button(action,label,glyph,{ ...options,data:`role="menuitem" ${options.data||''}` });

function showContext(kind, data, x, y) {
  let content='';
  if (kind==='port') {
    const port=getPort(data.port);
    if (!port) return;
    const connections=project.routes.filter(route=>route.from===port.id||route.to===port.id);
    const portAttr=`data-port="${attr(port.id)}"`;
    const members=portGroupMembers(port);
    const lockLabel=members.length>1?'所选接口':'接口';
    content=`<div class="context-title">${esc(kinds[port.kind])} · ${coordinate(port)}</div>${menuButton('start-wire','新建线路','cable',{data:portAttr})}
      ${menuButton('port-properties','端口属性','settings',{data:portAttr})}
      ${menuButton('toggle-port-group',activePortGroup()?.ids.has(port.id)?'从移动组移除':'加入移动组',null,{data:portAttr})}
      ${members.some(member=>member.locked!==true)?menuButton('set-port-lock',`固定${lockLabel}`,'lock',{data:`${portAttr} data-locked="true"`}):''}
      ${members.some(member=>member.locked===true)?menuButton('set-port-lock',`解锁${lockLabel}`,'unlock',{data:`${portAttr} data-locked="false"`}):''}
      ${isOutput(port)?menuButton('open-port-window','物品标记','box',{data:portAttr}):''}${port.kind==='out'?menuButton('return-to-core','接回控制室','arrow',{data:portAttr}):''}
      ${menuButton('structure','结构详情','box',{data:`data-slot="${port.slot}"`})}
      ${connections.length?`<div class="context-heading">已关联线路</div>${connections.map(route=>`<button type="button" role="menuitem" data-action="context-route" data-route="${attr(route.id)}"><i class="context-swatch" style="--wire:${routeInk(route.displayColor??getPort(route.from)?.color)}"></i><span>${esc(routeName(route))}</span>${route.locked?icon('lock',13):''}</button>`).join('')}`:''}
      ${menuButton('delete-port','移除端口','trash',{class:'context-danger',data:portAttr})}`;
  } else if (kind==='route') {
    const route=getRoute(data.route);
    if (!route) return;
    const routeAttr=`data-route="${attr(route.id)}"`;
    content=`<div class="context-title">${esc(routeName(route))}</div>
      ${menuButton('rename-route','改名','edit',{data:routeAttr})}
      ${menuButton('toggle-route-visibility',routeIsVisible(route)?'隐藏线路':'显示线路',null,{data:routeAttr})}
      ${menuButton('toggle-route-lock',route.locked?'解除固定':'固定线路',route.locked?'unlock':'lock',{data:routeAttr})}
      ${route.looseEnd&&!route.to?menuButton('move-end','移动端点','cable',{disabled:route.locked,data:routeAttr}):''}
      <div class="context-heading">层数</div><div class="context-depth">${LAYER_STYLES.map((style,index)=>menuButton('set-route-layer',style.name,null,{class:(route.layer??0)===index?'pressed':'',data:`${routeAttr} data-index="${index}"`})).join('')}</div>
      ${menuButton('route-properties','线路属性','settings',{data:routeAttr})}
      ${menuButton('clear-bends','自动重排','cable',{disabled:route.locked||!route.manual&&!route.bends?.length,data:routeAttr})}
      ${menuButton('delete-route','移除线路','trash',{class:'context-danger',data:routeAttr})}`;
  } else if (kind==='cell') {
    const { slot,x:cellX,y:cellY }=data;
    const cellData=`data-slot="${slot}" data-x="${cellX}" data-y="${cellY}"`;
    content=`<div class="context-title">${esc(slotName(slot))}</div>${slot>=0&&!project.modules[slot]
      ? menuButton('cell-install','安装结构','add',{data:cellData})
      : `${menuButton('structure','结构详情','box',{data:`data-slot="${slot}"`})}${slot>=0&&project.modules[slot]?.type!=='splitter'?menuButton('module-recipes','匹配配方','book',{data:`data-slot="${slot}"`}):''}${canPlace(slot,cellX,cellY)?portKinds(slot).map(([id,label])=>menuButton('cell-add-port',label,'add',{data:`${cellData} data-kind="${id}"`})).join(''):''}${slot>=0?menuButton('remove-module','移除结构','trash',{class:'context-danger',data:`data-slot="${slot}"`}):''}`}`;
  } else if (kind==='item') {
    const group=data.context==='rule'?splitterModule()?.rules[data.rule]?.items:getPort(data.port)?.items;
    const entry=group?.[data.index];
    if (!entry) return;
    const markData=`data-item-context="${data.context}" data-index="${data.index}" data-rule="${data.rule}" data-port-owner="${attr(data.port)}"`;
    const itemData=`data-item-id="${attr(entry.item)}"`;
    content=`<div class="context-title">${esc(itemName(entry.item))}</div>${menuButton('item-craft','查看制作','book',{data:itemData})}${menuButton('item-usage','查看用途','search',{data:itemData})}${menuButton('rename-item',entry.renamed?'取消改名标注':'改名标注','edit',{data:markData})}${menuButton('remove-item','移除标记','trash',{class:'context-danger',data:markData})}`;
  } else if (kind==='target') {
    const target=project.circuits[data.index];
    if (!target) return;
    content=`<div class="context-title">${esc(itemName(target.item))}</div>${menuButton('target-recipe','显示配方','book',{data:`data-index="${data.index}"`})}`;
  } else {
    content=`${menuButton('arrange','整理布线','align',{disabled:!project.routes.some(route=>route.to&&!route.locked)})}${menuButton('choose-recipe','选择目标配方','target')}${menuButton('recipes','打开合成表','book')}${menuButton('preferences','主题与快捷键','settings')}`;
  }
  hideTooltip();
  menuState={kind,data,x,y};
  contextMenu.innerHTML=content;
  contextMenu.hidden=false;
  contextMenu.style.left=`${Math.max(4,Math.min(x,innerWidth-contextMenu.offsetWidth-4))}px`;
  contextMenu.style.top=`${Math.max(4,Math.min(y,innerHeight-contextMenu.offsetHeight-4))}px`;
  contextMenu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
}

function selectRoute(route, showDrawer=true) {
  selection={ slot:null,x:null,y:null,port:null,route:route.id };
  if (showDrawer) drawer='properties';
  render();
}

function chooseSlot(slot) {
  selection={ slot,x:null,y:null,port:null,route:null };
  render();
}

function chooseCell(slot,x,y) {
  const port=findCellPort(slot,x,y);
  if (port) { choosePort(port); return; }
  selection={ slot,x,y,port:null,route:null };
  if (drawer!=='catalog') drawer='properties';
  render();
  if (slot>=0 && !project.modules[slot]) openModal('modules',{slot});
}

function newPort(kind) {
  const { slot,x,y }=selection;
  if (slot==null || !selectedCell() || !canPlace(slot,x,y)) {
    notify('请选择组件底板内的方块放置接口。',true);
    return;
  }
  const existing=findCellPort(slot,x,y);
  if (existing) return existing;
  const port={ id:makeId(),slot,x,y,kind,facing:'down',color:15,items:[] };
  project.ports.push(port);
  selection.port=port.id;
  return port;
}

function choosePort(port) {
  portGroup=null;
  selection={ slot:port.slot,x:port.x,y:port.y,port:port.id,route:null };
  if (tool==='route') { beginDraft(port); return; }
  if (drawer!=='catalog') drawer='properties';
  render();
  if (isOutput(port)) openPortWindow(port);
}

function selectTool(next) {
  cancelPortDrag();
  routeDrag=null;
  portGroup=null;
  tool=next;
  draft=null;
  render();
}

function boardPoint(event) {
  const matrix=document.querySelector('#diagram')?.getScreenCTM();
  if (!matrix) return null;
  return new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
}

function togglePortGroup(port) {
  const group=activePortGroup();
  const sameSlot=group?.slot===port.slot;
  const previous=sameSlot?null:getPort(selection.port);
  const ids=new Set(sameSlot?group.ids:previous?.slot===port.slot&&previous.id!==port.id?[previous.id]:[]);
  if (ids.has(port.id)) ids.delete(port.id);
  else ids.add(port.id);
  portGroup=ids.size?{project,slot:port.slot,ids}:null;
  const current=ids.has(port.id)?port:getPort(ids.values().next().value)??port;
  selection={slot:current.slot,x:current.x,y:current.y,port:current.id,route:null};
  tool='pointer';
  draft=null;
  if (drawer!=='catalog') drawer='properties';
  render();
}

function beginPortDrag(event,svg,port) {
  const origin=boardPoint(event);
  if (!origin) return;
  const members=portGroupMembers(port);
  const ids=new Set(members.map(member=>member.id));
  const blocked=members.some(member=>member.locked===true);
  portDrag={svg,port,ids,blocked,project,version,origin,pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,moved:false};
}

function updatePortDrag(event) {
  const drag=portDrag;
  if (drag.pointerId!==event.pointerId) return;
  if (drag.project!==project || drag.version!==version || !drag.svg.isConnected) { cancelPortDrag(); return; }
  if (!drag.moved) {
    if (Math.hypot(event.clientX-drag.clientX,event.clientY-drag.clientY)<4) return;
    drag.svg.setPointerCapture(event.pointerId);
    drag.moved=true;
    hideTooltip();
    if (!drag.blocked) {
      drag.svg.classList.add('is-port-dragging');
      for (const marker of drag.svg.querySelectorAll('.map-port[data-port]')) {
        if (drag.ids.has(marker.dataset.port)) marker.classList.add('port-drag-origin');
      }
    }
  }
  if (drag.blocked) return;
  const point=boardPoint(event);
  if (!point) return;
  const dx=Math.round((point.x-drag.origin.x)/CELL_SIZE);
  const dy=Math.round((point.y-drag.origin.y)/CELL_SIZE);
  if (dx===drag.dx && dy===drag.dy) return;
  Object.assign(drag,{dx,dy,move:translatePortGroup(project,drag.ids,dx,dy,canPlace)});
  const preview=drag.svg.querySelector('[data-port-drag-preview]');
  preview.classList.toggle('port-drag-invalid',!!drag.move.problem);
  preview.innerHTML=drag.move.ports.map(port=>portSvg(port,true)).join('');
}

function cancelPortDrag() {
  const drag=portDrag;
  portDrag=null;
  if (!drag?.moved) return;
  if (drag.svg.hasPointerCapture(drag.pointerId)) drag.svg.releasePointerCapture(drag.pointerId);
  drag.svg.classList.remove('is-port-dragging');
  for (const marker of drag.svg.querySelectorAll('.port-drag-origin')) marker.classList.remove('port-drag-origin');
  drag.svg.querySelector('[data-port-drag-preview]')?.replaceChildren();
  panUntil=performance.now()+160;
}

function applyPortMove(drag) {
  const moved=new Map(drag.move.ports.map(port=>[port.id,port]));
  project.ports=project.ports.map(port=>moved.get(port.id)??port);
  project.routes=project.routes.map(route=>{
    const geometry=routeGeometry.get(route.id);
    if (!geometry) return route;
    if (route.locked&&!route.manual) return { ...route,manual:true,bends:geometry.points.slice(1,-1) };
    if (!route.manual || !(moved.has(route.from) || moved.has(route.to))) return route;
    const from=getPort(route.from), to=getPort(route.to);
    if (!from || (!to && !route.looseEnd)) return route;
    const bends=reanchorPortBends(geometry.points,getPortPosition(from),to?getPortPosition(to):route.looseEnd);
    return { ...route,bends };
  });
  const current=moved.get(drag.port.id);
  if (drag.ids.size>1) portGroup={project,slot:current.slot,ids:drag.ids};
  else portGroup=null;
  selection={slot:current.slot,x:current.x,y:current.y,port:current.id,route:null};
  if (drawer!=='catalog') drawer='properties';
  changed(true,{label:drag.ids.size>1?'移动端口组':'移动端口'});
}

function finishPortDrag(event) {
  const drag=portDrag;
  if (drag.pointerId!==event.pointerId) return;
  if (drag.moved && event.type==='pointerup') updatePortDrag(event);
  if (portDrag!==drag) return;
  cancelPortDrag();
  if (!drag.moved || event.type!=='pointerup') return;
  if (drag.blocked) { notify('接口位置已固定，请先解锁。',true); return; }
  if (!drag.move || (!drag.dx && !drag.dy)) return;
  const onCanvas=document.elementFromPoint(event.clientX,event.clientY)?.closest('#diagram')===drag.svg;
  if (onCanvas && !drag.move.problem) { applyPortMove(drag); return; }
  if (drag.move.problem==='locked') notify('端口关联了固定线路，请先解除固定。',true);
  else if (drag.move.problem==='occupied') notify('目标位置已有端口，已回到原位。',true);
  else notify('请放在同一组件的有效端口格，已回到原位。',true);
}

const gridPoint = point => ({x:snapGridCoordinate(point.x),y:snapGridCoordinate(point.y)});

function snapPort(event, anchor) {
  const diagram=document.elementFromPoint(event.clientX,event.clientY)?.closest('#diagram');
  const matrix=diagram?.getScreenCTM();
  if (!matrix) return null;
  const halfCell=CELL_SIZE*Math.hypot(matrix.a,matrix.b)/2;
  const approach=Math.min(14,halfCell*1.25);
  let nearest=null;
  let best=Infinity;
  for (const port of project.ports) {
    if (port.id===anchor) continue;
    const {x,y}=getPortPosition(port);
    const view=new DOMPoint(x,y).matrixTransform(matrix);
    const dx=view.x-event.clientX,dy=view.y-event.clientY;
    const distance=Math.hypot(dx,dy);
    if (distance<best&&(Math.max(Math.abs(dx),Math.abs(dy))<=halfCell||distance<=approach)) {
      nearest=port;
      best=distance;
    }
  }
  return nearest;
}

function connectionFeedback(anchor,target,pipeDye) {
  const typeMatch=isInput(anchor)!==isInput(target);
  const dyeMatch=matchingPortDyes(anchor,target,pipeDye);
  const typeText=typeMatch?'类型匹配':isInput(anchor)?'两端都是输入口':'两端都是输出口';
  const fromDye=dye(anchor.color).name;
  const toDye=dye(target.color).name;
  let dyes=anchor.color===target.color?fromDye:`${fromDye} / ${toDye}`;
  if (!dyeMatch&&pipeDye!=null) dyes+=`，管道${DYE_COLORS[pipeDye]?.name??'染色无效'}`;
  return {matches:typeMatch&&dyeMatch,text:`${typeText} · ${dyeMatch?'染色一致':'染色不匹配'}（${dyes}）`};
}

function previewPath(points, color, depth, {anchor,snap,pipeDye,returning=false}={}) {
  const group=document.querySelector('.wire-preview');
  if (!group) return;
  const path=roundedRoutePath(points);
  const shadow=group.querySelector('.wire-preview-shadow');
  const line=group.querySelector('.pending-line');
  const style=routeStrokeStyle(depth,returning);
  for (const stroke of [shadow,line]) {
    stroke.setAttribute('d',path);
    stroke.style.strokeDasharray=style.dash||'none';
    stroke.style.strokeLinecap=style.lineCap;
  }
  line.style.stroke=routeInk(color);
  const ring=group.querySelector('.snap-ring');
  const hint=app.querySelector('.wire-target-hint');
  if (!snap) {
    ring.setAttribute('visibility','hidden');
    if (hint.textContent) hint.textContent='';
    return;
  }
  const {matches,text}=connectionFeedback(anchor,snap,pipeDye);
  const state=matches?'match':'mismatch';
  const {x,y}=getPortPosition(snap);
  ring.setAttribute('cx',x);
  ring.setAttribute('cy',y);
  ring.setAttribute('visibility','visible');
  ring.dataset.match=hint.dataset.match=state;
  if (hint.textContent!==text) hint.textContent=text;
}

function draftLocation(position,free,anchor) {
  const raw=boardPoint(position);
  return raw && {point:free?raw:gridPoint(raw),snap:snapPort(position,anchor)};
}

function refreshDraft(point,snap=null,free=false) {
  const anchor=getPort(draft?.anchor);
  if (!anchor || !point) return;
  Object.assign(draft,{point,snap,free});
  const previous=getRoute(draft.editing);
  const color=previous?.displayColor??chooseRouteColor(project,anchor,snap);
  previewPath(draftWirePoints(anchor,snap,point,draft.bends,previous,free),color,previous?.layer??layer,
    {anchor,snap,pipeDye:previous?.color,returning:isCoreReturn(anchor,snap)||isCoreReturn(snap,anchor)});
}

function updateDraft(position,free) {
  const location=draftLocation(position,free,draft.anchor);
  if (!location) return;
  draft.position={clientX:position.clientX,clientY:position.clientY};
  refreshDraft(location.point,location.snap,free);
}

function clearDraftHover() {
  if (!draft) return;
  draft.position=null;
  if (draft.snap) refreshDraft(draft.point,null,draft.free);
}

function beginDraft(port,route=null) {
  if (!port || route?.locked) return;
  tool='pointer';
  const origin=getPortPosition(port);
  const geometry=routeGeometry.get(route?.id);
  const bends=geometry?.points.slice(1,-1)||[];
  draft={anchor:port.id, editing:route?.id, bends, initialBendCount:bends.length, point:gridPoint(route?.looseEnd||{x:origin.x+CELL_SIZE,y:origin.y+CELL_SIZE}), snap:null};
  render();
}

function nextRouteName() {
  const names=new Set(project.routes.map(routeName));
  let index=1;
  while (names.has(`线路 ${index}`)) index++;
  return `线路 ${index}`;
}

function parallelWaypoints(anchor,snap,bends,previous) {
  if (bends.length || !snap || previous) return bends;
  const connections=project.routes.filter(route=>
    (route.from===anchor.id&&route.to===snap.id)||(route.to===anchor.id&&route.from===snap.id));
  if (!connections.length) return bends;
  const start=getPortPosition(anchor), end=getPortPosition(snap);
  const offset=Math.ceil(connections.length/2)*CELL_SIZE*(connections.length%2?1:-1);
  const horizontal=Math.abs(end.x-start.x)>=Math.abs(end.y-start.y);
  return [gridPoint({x:(start.x+end.x)/2+(horizontal?0:offset),y:(start.y+end.y)/2+(horizontal?offset:0)})];
}

function draftWirePoints(anchor,snap,point,bends,previous,free) {
  return draftRoutePoints(anchor,snap||point,parallelWaypoints(anchor,snap,bends,previous),{snap:!free||!!snap});
}

function placeRoute(anchor,snap,point,waypoints,previous,free=false) {
  const origin=getPortPosition(anchor);
  if (!snap && Math.hypot(origin.x-point.x,origin.y-point.y)<1) return null;
  const points=draftWirePoints(anchor,snap,point,waypoints,previous,free);
  if (points.length<2) return null;
  const reverse=snap&&isInput(anchor)&&isOutput(snap);
  const route=previous || { id:makeId(),name:nextRouteName(),layer,locked:false,
    displayColor:chooseRouteColor(project,anchor,snap) };
  Object.assign(route,{ from:reverse?snap.id:anchor.id,to:snap?(reverse?anchor.id:snap.id):null,
    manual:true,bends:points.slice(1,-1) });
  if (reverse) route.bends.reverse();
  if (snap) delete route.looseEnd;
  else route.looseEnd={x:point.x,y:point.y};
  if (!previous) project.routes.push(route);
  showLayers.add(route.layer);
  selection={slot:null,x:null,y:null,port:null,route:route.id};
  if (snap) {
    const feedback=connectionFeedback(anchor,snap,route.color);
    if (!feedback.matches) notify(feedback.text,true);
  }
  return route;
}

function finishDraft(event) {
  const free=event.shiftKey;
  const location=draftLocation(event,free,draft.anchor);
  if (!location) return;
  const {point,snap}=location;
  const anchor=getPort(draft.anchor);
  if (!anchor) { draft=null; render(); return; }
  if ((event.ctrlKey||event.metaKey)&&!snap) {
    draft.bends.push({x:point.x,y:point.y});
    updateDraft(event,free);
    return;
  }
  const route=placeRoute(anchor,snap,point,draft.bends,getRoute(draft.editing),free);
  if (!route) return;
  const label=draft.editing?'移动线路端点':'新建线路';
  draft=null;
  changed(true,{label});
}

function beginRouteDrag(event,svg,target) {
  const hit=target.closest('[data-route]');
  const route=hit && getRoute(hit.dataset.route);
  const geometry=route && routeGeometry.get(route.id);
  if (!route || route.locked || !geometry) return;
  const start=boardPoint(event);
  const index=nearestRouteSegment(geometry,start);
  if (index<0) return;
  const end=target.matches('[data-endpoint]')&&geometry.loose;
  const a=geometry.points[index], b=geometry.points[index+1];
  const normal=a.y===b.y?'y':'x';
  routeDrag={ route,geometry,index,end,normal,offset:start[normal]-a[normal],pointerId:event.pointerId,
    x:event.clientX,y:event.clientY, hit, svg, moved:false, patch:null, point:null, snap:null };
  hideTooltip();
}

function moveRouteDrag(event) {
  const drag=routeDrag;
  if (event.pointerId!==drag.pointerId) return;
  if (!drag.moved && Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<4) return;
  if (!drag.moved) drag.svg.setPointerCapture(event.pointerId);
  drag.moved=true;
  drag.hit.classList.add('is-moving');
  updateRouteDrag(event,event.shiftKey);
}

function updateRouteDrag(position,free) {
  const drag=routeDrag;
  const point=boardPoint(position);
  if (!point) return;
  drag.position={clientX:position.clientX,clientY:position.clientY};
  drag.free=free;
  if (drag.end) {
    drag.point=free?point:gridPoint(point);
    drag.snap=snapPort(position,drag.route.from);
    const anchor=getPort(drag.route.from);
    const points=draftWirePoints(anchor,drag.snap,drag.point,drag.geometry.points.slice(1,-1),drag.route,free);
    previewPath(points,drag.geometry.displayColorIndex,drag.route.layer,
      {anchor,snap:drag.snap,pipeDye:drag.route.color,returning:isCoreReturn(anchor,drag.snap)||isCoreReturn(drag.snap,anchor)});
  } else {
    const coordinate=point[drag.normal]-drag.offset;
    const next={x:point.x,y:point.y,[drag.normal]:free?coordinate:snapGridCoordinate(coordinate)};
    drag.patch=dragRouteSegment(drag.geometry,drag.index,next,{snap:!free});
    const original=drag.geometry.points;
    const points=drag.patch?[original[0],...drag.patch.bends,original.at(-1)]:original;
    previewPath(points,drag.geometry.displayColorIndex,drag.route.layer,{returning:drag.geometry.returning});
  }
}

function finishRouteDrag(event) {
  const drag=routeDrag;
  if (event.pointerId!==drag.pointerId) return;
  if (drag.moved&&event.type==='pointerup') updateRouteDrag(event,event.shiftKey);
  routeDrag=null;
  if (!drag?.moved) return;
  panUntil=performance.now()+160;
  if (event.type==='pointerup') {
    if (drag.end && drag.point && placeRoute(getPort(drag.route.from),drag.snap,drag.point,drag.geometry.points.slice(1,-1),drag.route,drag.free)) { changed(true,{label:'移动线路端点'}); return; }
    if (drag.patch) {
      Object.assign(drag.route,drag.patch);
      selection={slot:null,x:null,y:null,port:null,route:drag.route.id};
      changed(true,{label:'拖动线路'});
      return;
    }
  }
  render();
}

function addItem(id,context='port',{portId,renamed=false}={}) {
  const item=items.get(id);
  if (!item) return;
  if (context==='rule') {
    const rule=splitterModule()?.rules[ruleIndex];
    if (!rule) return;
    if (item.kind==='fluid') return notify('分流器的物品过滤槽只接收物品。',true);
    if (rule.items.some(entry=>entry.item===id&&!!entry.renamed===renamed)) return;
    if (rule.items.length>=16) return notify('这条规则的 16 个过滤槽已满。',true);
    rule.items.push({item:id,renamed});
    rulePage='items';
    changed(false,{label:'添加分流过滤物品'});
    renderModal();
    return;
  }
  const port=portId?getPort(portId):activePort() || (selectedCell() && newPort(selection.slot===-1?'feed':'in'));
  if (!port) return notify('请先选择端口或把物品拖到图纸方块。');
  if (port.items.some(entry=>entry.item===id&&!!entry.renamed===renamed)) return;
  port.items.push({item:id,renamed});
  const state=portWindows.get(port.id);
  if (state) state.page=Math.floor((port.items.length-1)/16);
  changed(true,{label:'添加端口物品标记'});
}

function connectCoreReturn(source) {
  if (source?.kind!=='out') return;
  const existing=project.routes.find(route=>route.from===source.id&&getPort(route.to)?.kind==='final');
  if (existing) { selectRoute(existing); return; }
  const reusable=project.ports.find(port=>port.slot===-1&&port.kind==='final'&&port.color===source.color&&
    !project.routes.some(route=>route.to===port.id)&&(!port.items.length||source.items.some(mark=>port.items.some(item=>item.item===mark.item))));
  let sink=reusable;
  if (!sink) {
    const a=getPortPosition(source),center=getPlatform(-1);
    const dx=a.x-center.cx,dy=a.y-center.cy;
    const facing=Math.abs(dx)>Math.abs(dy)?(dx>0?'e':'w'):(dy>0?'s':'n');
    const cells=[];
    for (let y=0;y<7;y++) for (let x=0;x<7;x++) {
      if (findCellPort(-1,x,y)) continue;
      const cell=getCell(-1,x,y);
      cells.push({x,y,distance:Math.abs(a.x-cell.cx)+Math.abs(a.y-cell.cy)});
    }
    cells.sort((a,b)=>a.distance-b.distance);
    if (!cells.length) return notify('主体控制室没有可放置成品回收端口的空格。',true);
    sink={id:makeId(),slot:-1,x:cells[0].x,y:cells[0].y,kind:'final',facing,color:source.color,items:[]};
    project.ports.push(sink);
  }
  const route={id:makeId(),name:'成品回流',from:source.id,to:sink.id,layer:0,bends:[],locked:false,displayColor:chooseRouteColor(project,source,sink)};
  project.routes.push(route);
  showLayers.add(0);
  selection={slot:null,x:null,y:null,port:null,route:route.id};
  drawer='properties';
  changed(true,{label:'连接成品回流'});
  notify('已连至主体控制室的成品回收端口。');
}

function confirmAction(title,message,fn) {
  openModal('confirm',{ title,message,fn });
}

function removeSlot(slot) {
  const ids=new Set(project.ports.filter(port=>port.slot===slot).map(port=>port.id));
  if (ids.has(draft?.anchor)) draft=null;
  project.ports=project.ports.filter(port=>!ids.has(port.id));
  project.routes=project.routes.filter(route=>!ids.has(route.from)&&!ids.has(route.to));
  project.modules[slot]=null;
  selection={ slot,x:null,y:null,port:null,route:null };
}

function installModule(type) {
  const slot=modal?.slot;
  if (slot==null || slot<0 || !modules.has(type)) return;
  if (project.modules[slot]?.type===type) { closeModal(); return; }
  const install=()=>{
    removeSlot(slot);
    project.modules[slot]=makeModule(type);
    closeModal();
    changed(true,{label:'安装结构'});
  };
  if (project.ports.some(port=>port.slot===slot)) confirmAction('更换结构','更换会移除此槽位的端口及相关管线。',install);
  else install();
}

function runAnalysis(index=activeCircuit) {
  const circuit=project.circuits[index];
  if (!circuit) return;
  if (!engine?.analyzeCircuit) throw Error('配方验证引擎载入失败。');
  const report=engine.analyzeCircuit(project,dataset,circuit);
  reports.set(circuit.item,report);
  return report;
}

async function onAction(action,target,event) {
  if (portableProjectBusy) return;
  const data=target.dataset;
  const index=Number(data.index);
  const slot=Number(data.slot);
  const id=data.id;
  if (action.startsWith('tool-')) { selectTool(action.slice(5)); return; }
  switch (action) {
    case 'none': return;
    case 'new': openModal('new'); return;
    case 'open': openModal('open',{ rows:await api('/api/projects') }); return;
    case 'save':
      if (webEdition) {
        if (!await saveWebFile()) return;
      } else {
        await persist(true);
        notify('工程已保存');
      }
      if (modal?.kind==='history') openModal('history',{rows:await api(`/api/projects/${project.id}/backups`)});
      return;
    case 'history': await persist(); openModal('history',{rows:await api(`/api/projects/${project.id}/backups`)}); return;
    case 'operations':
      if (modal?.kind==='operations') closeModal();
      else openModal('operations');
      return;
    case 'undo': if (canUndo()) seekOperation(operationHistory.cursor-1); return;
    case 'redo': if (canRedo()) seekOperation(operationHistory.cursor+1); return;
    case 'seek-operation': seekOperation(index); return;
    case 'load-project': {
      if (portableEdition) {
        if (!data.fileKey) throw Error('无法确认工程文件，请重新打开工程列表。');
        await openPortableProject(()=>desktop.openProject(data.fileKey));
        return;
      }
      await persist();
      const saved=await api(`/api/projects/${id}`);
      await switchProject(saved.project,saved.revision,saved.operationHistory);
      return;
    }
    case 'restore': {
      const saved=await api(`/api/projects/${project.id}/backups/${id}`);
      const restored=prepareProject(saved.project,{copy:true});
      restored.name+='（恢复副本）';
      await switchProject(restored);
      return;
    }
    case 'help': case 'about': case 'notes': case 'preferences': openModal(action); return;
    case 'power': openModal('power'); return;
    case 'toggle-targets':
      targetsOpen=!targetsOpen;
      localStorage.setItem('nac.targetsOpen',String(targetsOpen));
      render();
      if (event.detail===0) app.querySelector('[data-action="toggle-targets"]')?.focus();
      return;
    case 'generate-final': {
      if (!project.circuits.length) return;
      recipeTrail.length=0;
      const batch=generateFinalRecipes(project,dataset);
      for (const entry of batch.entries) reports.set(entry.target.item,entry.report);
      render();
      openModal('final-recipes',{batch,index:0,version:recipeVersion});
      return;
    }
    case 'select-final': modal.index=index; renderModal(); return;
    case 'target-recipe': lookupRecipe(project.circuits[index]?.item,'craft',{target:true}); return;
    case 'item-craft': lookupRecipe(data.itemId); return;
    case 'item-usage': lookupRecipe(data.itemId,'usage'); return;
    case 'recipe-back': recipeBack(); return;
    case 'recipe-direction': lookupRecipe(modal?.lookup?.item,data.value,{record:false}); return;
    case 'toggle-right':
      rightCollapsed=!rightCollapsed;
      localStorage.setItem('nac.rightCollapsed',String(rightCollapsed));
      render();
      if (event.detail===0) app.querySelector('[data-action="toggle-right"]')?.focus();
      return;
    case 'lock-dialog': {
      const state=dialogLayouts.get(modal?.kind);
      if (state) { state.locked=!state.locked; renderModal(); }
      return;
    }
    case 'structure': openStructure(slot); return;
    case 'close-structure': structureWindows.delete(slot); renderStructures(); return;
    case 'lock-structure': {
      const state=structureWindows.get(slot);
      if (state) { state.locked=!state.locked; renderStructures(); }
      return;
    }
    case 'structure-tab': {
      const state=structureWindows.get(slot);
      if (state) { state.tab=id; renderStructures(); }
      return;
    }
    case 'open-port-window': openPortWindow(getPort(data.port)); return;
    case 'close-port-window': portWindows.delete(data.portOwner); renderPortWindows(); return;
    case 'lock-port-window':
    case 'port-page': {
      const state=portWindows.get(data.portOwner);
      if (state) {
        if (action==='lock-port-window') state.locked=!state.locked;
        else state.page+=Number(data.value);
        renderPortWindows();
      }
      return;
    }
    case 'return-to-core': connectCoreReturn(getPort(data.port)); return;
    case 'choose-water': applyField(target); return;
    case 'arrange': {
      if (!project.routes.some(route=>route.to&&!route.locked)) return;
      openModal('arrange',{version,weights:arrangeWeights,arrangePorts,preview:createArrangePreview(),pending:true});
      queueArrangement();
      return;
    }
    case 'reset-arrange-weights': setArrangeWeights(DEFAULT_ARRANGE_WEIGHTS); return;
    case 'arrange-view': switchArrangeView(id); return;
    case 'arrange-zoom-out': zoomArrange(.8); return;
    case 'arrange-zoom-in': zoomArrange(1.25); return;
    case 'arrange-zoom-fit': fitArrange(); return;
    case 'apply-arrange':
      if (modal?.kind==='arrange'&&!modal.pending&&!modal.error&&hasArrangementChanges(modal.result)&&modal.version===version) {
        const {routes,ports,movedPorts}=modal.result;
        project.routes=routes;
        if (movedPorts) {
          project.ports=ports;
          const selected=activePort();
          if (selected) Object.assign(selection,{x:selected.x,y:selected.y});
        }
        closeModal();
        changed(true,{label:movedPorts?'整理布线与接口':'整理布线'});
        notify(movedPorts?`已应用整理，移动 ${movedPorts} 个接口。`:'已应用线路整理。');
      }
      return;
    case 'reset-shortcuts':
      preferences.shortcuts={...shortcutDefaults};
      savePreferences(); render(); renderModal(); return;
    case 'toggle-catalog': {
      drawer=rightCollapsed||drawer!=='catalog'?'catalog':'properties';
      rightCollapsed=false;
      localStorage.setItem('nac.rightCollapsed','false');
      render();
      if (drawer==='catalog') document.querySelector('[data-search="catalog"]')?.focus();
      return;
    }
    case 'drawer-properties': drawer='properties'; render(); return;
    case 'download-project':
      if (webEdition) await saveWebFile(true);
      else await exportProjectFile();
      return;
    case 'import-project':
      if (webEdition) await pickWebProject();
      else if (portableEdition) await openPortableProject(()=>desktop.pickProject());
      else document.querySelector('#project-file').click();
      return;
    case 'convert-html-project':
      if (portableEdition) document.querySelector('#project-file').click();
      return;
    case 'open-folder':
      if (portableEdition) await choosePortableProjectFolder();
      else await pickWebProjectFolder();
      return;
    case 'open-folder-file': {
      const handle = modal?.files?.get(id);
      if (handle) await openWebFile(await handle.getFile(),handle);
      return;
    }
    case 'catalog-import': document.querySelector('#catalog-file').click(); return;
    case 'examples': {
      const rows=await fetch(webAsset('/data/examples/index.json')).then(response=>response.ok?response.json():[]).catch(()=>[]);
      openModal('examples',{rows});
      return;
    }
    case 'load-example': {
      if (!/^[a-z0-9-]+$/.test(id)) return;
      const raw=await fetch(webAsset(`/data/examples/${id}.json`)).then(response=>{ if (!response.ok) throw Error('示例工程无法读取'); return response.json(); });
      await switchProject(prepareProject(raw,{copy:true}));
      return;
    }
    case 'close': closeModal(); return;
    case 'confirm': return modal?.fn?.();
    case 'focus-slot': chooseSlot(slot); return;
    case 'pick-module': openModal('modules',{slot:selection.slot}); return;
    case 'replace-module': chooseSlot(slot); openModal('modules',{slot}); return;
    case 'install': installModule(id); return;
    case 'remove-module': confirmAction('移除结构','这个结构的所有端口和管线也会移除。',()=>{ removeSlot(slot); closeModal(); changed(true,{label:'移除结构'}); }); return;
    case 'cell': chooseCell(slot,Number(data.x),Number(data.y)); return;
    case 'cell-install': chooseCell(slot,Number(data.x),Number(data.y)); return;
    case 'cell-add-port':
      selection={slot,x:Number(data.x),y:Number(data.y),port:null,route:null};
      drawer='properties';
      if (newPort(data.kind)) changed(true,{label:'新建端口'});
      return;
    case 'select-port': {
      const port=getPort(data.port);
      if (port && tool==='pointer' && (event.ctrlKey||event.metaKey)) togglePortGroup(port);
      else if (port) choosePort(port);
      return;
    }
    case 'toggle-port-group': {
      const port=getPort(data.port);
      if (port) togglePortGroup(port);
      return;
    }
    case 'set-port-lock': {
      const port=getPort(data.port);
      if (!port) return;
      const members=portGroupMembers(port);
      const locked=data.locked==='true';
      for (const member of members) {
        if (locked) member.locked=true;
        else delete member.locked;
      }
      const label=`${locked?'固定':'解锁'}接口${members.length>1?'组':''}`;
      changed(true,{analysis:false,label});
      return;
    }
    case 'port-properties': {
      const port=getPort(data.port);
      if (!port) return;
      selection={slot:port.slot,x:port.x,y:port.y,port:port.id,route:null};
      drawer='properties'; rightCollapsed=false; localStorage.setItem('nac.rightCollapsed','false'); render(); return;
    }
    case 'port-menu': case 'route-menu': {
      const rect=target.getBoundingClientRect();
      showContext(action==='port-menu'?'port':'route',data,rect.left,rect.bottom+4);
      return;
    }
    case 'add-port': if (newPort(data.kind)) changed(true,{label:'新建端口'}); return;
    case 'delete-port': {
      const port=getPort(data.port||selection.port);
      if (!port) return;
      const remove=()=>{
        project.ports=project.ports.filter(entry=>entry.id!==port.id);
        project.routes=project.routes.filter(route=>route.from!==port.id&&route.to!==port.id);
        if (draft?.anchor===port.id||!getRoute(draft?.editing)&&draft?.editing) draft=null;
        if (selection.port===port.id) selection.port=null;
        if (modal?.kind==='confirm') closeModal();
        changed(true,{label:'移除端口'});
      };
      if (project.routes.some(route=>route.from===port.id||route.to===port.id)) confirmAction('移除端口','此端口关联的线路也会移除。',remove);
      else remove();
      return;
    }
    case 'start-wire': beginDraft(getPort(data.port||selection.port)); return;
    case 'move-end': {
      const route=getRoute(data.route);
      if (route&&!route.to) beginDraft(getPort(route.from),route);
      return;
    }
    case 'select-route': case 'route-properties': case 'context-route': {
      const route=getRoute(data.route);
      if (!route) return;
      selectRoute(route,action!=='context-route');
      if (action==='context-route') showContext('route',data,event.clientX,event.clientY);
      return;
    }
    case 'rename-route': openModal('rename-route',{id:data.route}); dialog.querySelector('input')?.select(); return;
    case 'toggle-route-lock': {
      const route=getRoute(data.route);
      if (!route) return;
      if (!route.locked&&!route.manual) {
        const geometry=routeGeometry.get(route.id);
        if (geometry) { route.bends=geometry.points.slice(1,-1); route.manual=true; }
      }
      route.locked=!route.locked;
      changed(true,{label:route.locked?'固定线路':'解除固定线路'});
      return;
    }
    case 'set-route-layer': {
      const route=getRoute(data.route);
      if (route) { route.layer=index; layer=index; showLayers.add(index); changed(true,{label:'更改线路层数'}); }
      return;
    }
    case 'delete-route': {
      const route=getRoute(data.route||selection.route);
      if (!route) return;
      project.routes=project.routes.filter(entry=>entry.id!==route.id);
      if (selection.route===route.id) selection.route=null;
      if (draft?.editing===route.id) draft=null;
      changed(true,{label:'删除线路'}); return;
    }
    case 'clear-bends': {
      const route=getRoute(data.route||selection.route);
      if (route&&!route.locked) { route.bends=[]; route.manual=false; changed(true,{label:'重置线路走向'}); }
      return;
    }
    case 'map-background':
      if (tool!=='hand'&&!toolSpace) chooseSlot(null);
      return;
    case 'zoom-in': case 'zoom-out': zoom(action==='zoom-in'?1.25:.8); return;
    case 'zoom-fit': fitView(); return;
    case 'toggle-module-fluids':
      showModuleFluids=!showModuleFluids;
      localStorage.setItem(moduleFluidVisibilityKey,String(showModuleFluids));
      render();
      if (event.detail===0) app.querySelector('[data-action="toggle-module-fluids"]')?.focus({preventScroll:true});
      return;
    case 'toggle-layer':
      if (showLayers.has(index)) showLayers.delete(index); else showLayers.add(index);
      render(); return;
    case 'toggle-route-visibility': {
      const route=getRoute(data.route);
      if (!route) return;
      route.hidden=routeIsVisible(route);
      if (!route.hidden) showLayers.add(route.layer??0);
      if (route.hidden&&draft?.editing===route.id) draft=null;
      changed(true,{analysis:false,label:route.hidden?'隐藏线路':'显示线路'});
      return;
    }
    case 'toggle-all-routes': {
      if (!project.routes.length) return;
      const hide=project.routes.some(routeIsVisible);
      for (const route of project.routes) route.hidden=hide;
      if (!hide) for (const [index] of LAYER_STYLES.entries()) showLayers.add(index);
      if (hide&&draft?.editing) draft=null;
      changed(true,{analysis:false,label:hide?'隐藏全部线路':'显示全部线路'});
      return;
    }
    case 'catalog-prev': case 'catalog-next':
      catalogPage+=action==='catalog-prev'?-1:1;
      document.querySelector('#catalog-tiles').innerHTML=catalogTiles();
      return;
    case 'catalog-item': lookupRecipe(data.itemId); return;
    case 'add-port-suggestion': addItem(data.itemId,'port',{portId:data.portOwner,renamed:data.renamed==='true'}); return;
    case 'port-item': case 'rule-item': openItemMenu(target,event); return;
    case 'rename-item': case 'remove-item': {
      const group=data.itemContext==='rule'?splitterModule()?.rules[Number(data.rule)]?.items:getPort(data.portOwner)?.items;
      if (!group?.[index]) return;
      if (action==='rename-item') group[index].renamed=!group[index].renamed;
      else group.splice(index,1);
      changed(true,{label:action==='rename-item'?'切换重命名标记':'移除物品标记'});
      return;
    }
    case 'splitter': ruleIndex=0; rulePage='items'; openModal('splitter',{slot}); return;
    case 'add-rule':
      splitterModule().rules.push(makeRule());
      ruleIndex=splitterModule().rules.length-1; changed(false,{label:'添加分流规则'}); renderModal(); return;
    case 'select-rule': ruleIndex=index; renderModal(); return;
    case 'delete-rule':
      splitterModule().rules.splice(ruleIndex,1);
      ruleIndex=Math.max(0,ruleIndex-1); changed(false,{label:'删除分流规则'}); renderModal(); return;
    case 'rule-page': rulePage=id; renderModal(); return;
    case 'rule-color': {
      const rule=splitterModule()?.rules[ruleIndex];
      if (!rule) return;
      const values=rule[data.key]||[];
      rule[data.key]=values.includes(index)?values.filter(value=>value!==index):[...values,index];
      changed(false,{label:'修改分流颜色'}); renderModal(); return;
    }
    case 'add-rule-item': addItem(data.itemId,'rule',{renamed:data.renamed==='true'}); return;
    case 'module-recipes': case 'module-fluid-recipes':
      if (!project.modules[slot]) return;
      recipeTrail.length=0;
      recipeFilter='all'; recipeQuery=''; activeRecipe='';
      openModal('recipes',{moduleSlot:slot,moduleFluid:action==='module-fluid-recipes'?data.fluid:null});
      return;
    case 'clear-module-fluid-filter':
      if (modal?.kind!=='recipes'||!modal.moduleFluid) return;
      delete modal.moduleFluid;
      renderModal();
      dialog.querySelector('[data-search="recipe"]')?.focus({preventScroll:true});
      return;
    case 'choose-module-recipe':
      if (setModuleRecipe(dataset,project.modules[modal?.moduleSlot],id,data.selected!=='true')) changed(true,{label:'修改结构配方'});
      return;
    case 'recipes': case 'choose-recipe':
      recipeTrail.length=0;
      recipeFilter=action==='choose-recipe'?'circuits':'all';
      recipeTier=''; recipeQuery=''; activeRecipe='';
      openModal('recipes',{choosing:action==='choose-recipe'});
      dialog.querySelector('[data-search="recipe"]')?.focus();
      return;
    case 'select-recipe': {
      activeRecipe=id;
      const active=recipeRows().find(row=>row.id===id);
      const list=dialog.querySelector('#recipe-list');
      for (const row of list.querySelectorAll('.recipe-row')) {
        const selected=row.dataset.id===id;
        row.classList.toggle('selected',selected);
        row.setAttribute('aria-pressed',String(selected));
      }
      refreshRecipeSelection(active);
      return;
    }
    case 'add-target':
      if (!circuits.includes(id)) return;
      activeCircuit=project.circuits.findIndex(circuit=>circuit.item===id);
      if (activeCircuit<0) { activeCircuit=project.circuits.length; project.circuits.push({item:id,quantity:1}); changed(true,{label:'添加目标电路'}); }
      targetsOpen=true;
      localStorage.setItem('nac.targetsOpen','true');
      render();
      closeModal();
      return;
    case 'target':
      activeCircuit=index;
      render(); return;
    case 'analyze':
      runAnalysis();
      resultsTab='验证';
      render();
      openModal('results'); return;
    case 'result-tab': resultsTab=data.value; renderModal(); return;
    case 'inspect-issue': inspectIssue(index); return;
    case 'exit-issue-focus': exitIssueFocus(); return;
    case 'remove-target':
      project.circuits.splice(activeCircuit,1);
      activeCircuit=Math.max(0,Math.min(project.circuits.length-1,activeCircuit));
      closeModal(); changed(true,{label:'移除目标电路'}); return;
    case 'remove-target-at':
      project.circuits.splice(index,1);
      if (index<activeCircuit) activeCircuit--;
      activeCircuit=Math.max(0,Math.min(project.circuits.length-1,activeCircuit));
      changed(true,{label:'移除目标电路'}); return;
    case 'apply-ratio':
      project.power.ratio=Number(data.value);
      changed(true,{label:'应用能量分配比例'}); runAnalysis(); renderModal(); return;
  }
}

function openItemMenu(element,event) {
  const index=Number(element.dataset.index);
  const context=element.dataset.itemContext;
  const bounds=element.getBoundingClientRect();
  showContext('item',{index,context,port:element.dataset.portOwner,rule:ruleIndex},event.clientX||bounds.left,event.clientY||bounds.bottom);
}

function zoom(factor,anchor=null) {
  const nextZoom=Math.min(4,Math.max(Math.min(.1,camera.zoom),camera.zoom*factor));
  if (anchor) {
    const shift=1-camera.zoom/nextZoom;
    camera.x+=(anchor.x-BOARD_CENTER-camera.x)*shift;
    camera.y+=(anchor.y-BOARD_CENTER-camera.y)*shift;
  }
  camera.zoom=nextZoom;
  updateView();
}

function applyField(element) {
  const key=element.dataset.field;
  if (!key) return;
  if (element.classList.contains('voltage-select')) {
    const tier=element.selectedOptions[0]?.dataset.voltage;
    if (tier) element.dataset.voltage=tier;
    else element.removeAttribute('data-voltage');
  }
  const value=element.value;
  const numeric=value===''?null:Number(value);
  const structurePanel=element.closest('[data-structure-window]');
  const structureSlot=structurePanel?Number(structurePanel.dataset.structureWindow):null;
  if (key==='theme') { preferences.theme=value; savePreferences(); applyTheme(); return; }
  if (key.startsWith('shortcut-')) {
    const id=key.slice(9);
    try { preferences.shortcuts[id]=validateShortcut(preferences.shortcuts,id,value); savePreferences(); }
    finally { element.value=preferences.shortcuts[id]; }
    render();
    return;
  }
  if (key==='catalog-kind') { catalogKind=value; catalogPage=0; document.querySelector('#catalog-tiles').innerHTML=catalogTiles(); return; }
  if (key==='recipe-filter'||key==='recipe-tier') {
    if (key==='recipe-tier') recipeTier=value;
    else recipeFilter=value;
    renderModal();
    dialog.querySelector(`[data-field="${key}"]`)?.focus({preventScroll:true});
    return;
  }
  if (key==='structure-layer') {
    const state=structureWindows.get(structureSlot);
    if (state) { state.layer=numeric; renderStructures(); }
    return;
  }
  if (key==='active-target') { activeCircuit=numeric; runAnalysis(); render(); renderModal(); return; }
  if (key.startsWith('rule-')) {
    const module=splitterModule();
    const rule=module.rules[ruleIndex];
    if (!rule.redstone || typeof rule.redstone!=='object') rule.redstone={channel:0,level:0};
    const strength=Math.max(0,Math.min(15,Math.round(numeric||0)));
    if (key==='rule-channel') rule.redstone.channel=strength;
    if (key==='rule-level') rule.redstone.level=strength;
    if (key==='rule-signal') {
      const signals=module.config.redstone ||= Array(16).fill(0);
      signals[rule.redstone.channel]=strength;
    }
    changed(false,{label:'修改分流红石信号'});
    renderModal();
    return;
  }
  if (key==='name') { project.name=value.trim()||'未命名工程'; element.value=project.name; changed(false); syncProjectAddress(); updateStatus(); return; }
  else if (key==='notes') { project.notes=value; changed(false); return; }
  else if (key==='quantity') {
    const target=project.circuits[Number(element.dataset.index)];
    target.quantity=Math.max(1,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(numeric||1)));
    element.value=target.quantity;
    changed(false,{label:'更改目标电路数量'});
    updateStatus();
    return;
  }
  else if (key.startsWith('power-')) {
    const power=project.power;
    const prop=key.slice(6);
    if (prop==='ratio') power.ratio=Math.max(1,Math.min(99,Math.round(numeric??25)));
    else if (prop==='family') {
      const level=calibrationLevel(power.calibration)??0;
      power.calibration=value?{family:value,level}:level;
    }
    else if (prop==='calibration') power.calibration=typeof power.calibration==='object'?{...power.calibration,level:numeric}:numeric;
    else power[prop]=element.type==='number'?numeric:value;
    changed(false,{label:prop==='ratio'?'更改能量分配比例':prop==='calibration'||prop==='family'?'修改精校设置':'修改供电设置'});
    if (prop==='ratio') {
      element.value=power.ratio;
      updatePowerSlider(element);
    } else if (prop==='mode') renderModal();
    else if (prop==='family'||prop==='calibration') {
      refreshPowerCalibration();
      renderStructures();
    }
    else if (prop==='eu'||prop==='tier'||prop==='amps') {
      const total=power.mode==='eu'?power.eu:power.amps&&dataset.voltages?.[power.tier]?power.amps*dataset.voltages[power.tier]:null;
      const label=dialog.querySelector('.power-total');
      if (label) label.textContent=`${fmt(total)} EU/t`;
    }
    return;
  } else if (key.startsWith('port-')) {
    const port=activePort();
    if (!port) return;
    const prop=key.slice(5);
    port[prop]=prop==='color'?numeric:value;
  } else if (key.startsWith('module-')) {
    const module=project.modules[structureSlot];
    if (!module) return;
    switch (key) {
      case 'module-rotation': {
        const turns=((numeric-module.rotation+360)%360)/90;
        const cardinal=['n','e','s','w'];
        for (const port of project.ports.filter(port=>port.slot===structureSlot)) {
          for (let i=0;i<turns;i++) [port.x,port.y]=[6-port.y,port.x];
          if (cardinal.includes(port.facing)) port.facing=cardinal[(cardinal.indexOf(port.facing)+turns)%4];
          if (port.id===selection.port) { selection.x=port.x; selection.y=port.y; }
        }
        module.rotation=numeric;
        break;
      }
      case 'module-casing': module.casingTier=numeric; break;
      case 'module-water': module.waterTier=numeric; break;
      case 'module-water-0': case 'module-water-1': {
        const tiers=[...opticalWaterTiers(module)];
        tiers[Number(key.at(-1))]=numeric;
        module.config.waterTiers=tiers;
        break;
      }
      case 'module-fluid': module.fluid=value||null; break;
      case 'module-impurity': module.config.impurity=numeric; break;
      case 'module-laser-tier': module.config.laserTier=value||null; break;
      case 'module-laser-amps': module.config.laserAmps=numeric; break;
      case 'module-isolate': module.isolate=element.checked; break;
      case 'module-ignore': module.ignoreMaterials=element.checked; break;
      case 'module-supply-manual':
        if (element.checked) module.config.fluids=[];
        else delete module.config.fluids;
        break;
      case 'module-supply-fluid': {
        const current=new Set(module.config.fluids||[]);
        if (element.checked) current.add(element.dataset.id);
        else current.delete(element.dataset.id);
        module.config.fluids=[...current];
        break;
      }
    }
  } else if (key==='route-layer' || key==='route-display-color') {
    const route=activeRoute();
    if (!route) return;
    if (key==='route-layer') { route.layer=numeric; layer=numeric; showLayers.add(numeric); }
    else if (numeric==null) delete route.displayColor;
    else route.displayColor=numeric;
  } else return;
  changed();
}

function hideTooltip() { tooltip.hidden=true; }
function waterTooltip(target) {
  const tier=Number(target.dataset.waterTier);
  const type=target.dataset.waterModule;
  const water=purifiedWater(tier);
  const boost=type==='optical'?opticalWaterBoost(tier):null;
  const recipes=type==='cutting'&&water?fluidRecipeRows(water.id):[];
  const lines=boost
    ? [waterEffect(boost),`基础消耗 ${perSecond(boost.perSecond)}`]
    : recipes.length?cuttingStats(water.id,recipes).map(([label,value])=>`${label} ${value}`):['切割液用量与耗时以具体配方为准'];
  return `${asset(itemIcon(water),'pixel')}<div><b>${esc(waterName(tier))}</b>${lines.map(line=>`<small>${esc(line)}</small>`).join('')}</div>`;
}

function materialTooltip(target) {
  const {tipPort,tipLayer}=target.dataset;
  const key=tipPort?`port-materials:${tipPort}`:`layer-materials:${tipLayer}`;
  if (tooltip.dataset.current!==key) {
    const ports=new Set();
    if (tipPort) ports.add(tipPort);
    else for (const route of project.routes) {
      const [from,to]=routeEnds(route);
      if (tipLayer==='return'?!isCoreReturn(from,to):(route.layer??0)!==Number(tipLayer)) continue;
      const source=isOutput(to)&&!isOutput(from)?to:from;
      if (source) ports.add(source.id);
    }
    const materials=new Set();
    for (const id of ports) {
      const port=getPort(id);
      for (const entry of port?.items.length?port.items:portItemSuggestions(project,dataset,id)) materials.add(entry.item);
    }
    tooltip.dataset.current=key;
    tooltip.innerHTML=[...materials].map(id=>`<span class="material-icon">${asset(itemIcon(items.get(id)),'pixel',itemName(id))||`<span role="img" aria-label="${attr(itemName(id))}">⬡</span>`}</span>`).join('');
  }
  if (!tooltip.childElementCount) return false;
  const maxRows=Math.max(1,Math.floor((innerHeight-48)/24));
  const count=tooltip.childElementCount;
  const columns=Math.min(Math.floor((innerWidth-28)/24),Math.max(Math.ceil(Math.sqrt(count*1.6)),Math.ceil(count/maxRows)),count);
  tooltip.style.setProperty('--material-columns',Math.max(1,columns));
  return true;
}

const tooltipTargets='[data-tip-heading],[data-water-tier],[data-tip-item],[data-tip-port],[data-tip-layer]';

function showTooltip(event) {
  const target=event.target.closest?.(tooltipTargets);
  if (!target) { hideTooltip(); return; }
  const heading=target.dataset.tipHeading;
  const effectHelp=target.hasAttribute('data-module-effect-help');
  const material=target.hasAttribute('data-tip-layer')||target.hasAttribute('data-tip-port');
  tooltip.classList.toggle('material-tooltip',material);
  tooltip.classList.toggle('heading-tooltip',!!heading);
  tooltip.classList.toggle('effect-tooltip',effectHelp);
  if (heading) {
    const key=`${effectHelp?'effect':'heading'}:${heading}`;
    if (tooltip.dataset.current!==key) {
      tooltip.dataset.current=key;
      if (effectHelp) {
        const [title,...lines]=heading.split('\n');
        tooltip.innerHTML=`<b>${esc(title)}</b>${lines.map(line=>`<span>${esc(line)}</span>`).join('')}`;
      } else tooltip.textContent=heading;
    }
  } else if (material) {
    if (!materialTooltip(target)) { hideTooltip(); return; }
  } else {
    const id=target.dataset.tipItem;
    const entry=items.get(id)||(target.hasAttribute('data-module-fluid')?{id,name:itemName(id),kind:'fluid'}:null);
    const water=target.dataset.waterTier;
    if (!entry&&!water) { hideTooltip(); return; }
    const details=target.dataset.tipDetails;
    const tipKey=water?`water:${target.dataset.waterModule}:${water}`:details?JSON.stringify([entry.id,details]):entry.id;
    if (tooltip.dataset.current!==tipKey) {
      tooltip.dataset.current=tipKey;
      const tier=entry?circuitTier(entry):null;
      tooltip.innerHTML=water?waterTooltip(target):`${asset(itemIcon(entry),'pixel')}<div><b>${esc(entry.name)}</b><small>${entry.kind==='fluid'?'流体':entry.role==='cc'?'电路组件':'物品'}${entry.registry?` · ${esc(entry.registry)}`:''}</small>${tier?`<small class="tooltip-tier">电路等级 <strong class="voltage-label" data-voltage="${attr(tier)}">${esc(tier)}</strong></small>`:''}${details?`<small class="recipe-tip-details">${esc(details)}</small>`:''}</div>`;
    }
  }
  tooltip.hidden=false;
  const bounds=target.getBoundingClientRect();
  const focus=event.type==='focusin';
  const above=target.hasAttribute('data-tip-layer');
  const x=above?bounds.left+(bounds.width-tooltip.offsetWidth)/2:(focus?bounds.right:event.clientX)+16;
  const y=above?bounds.top-tooltip.offsetHeight-7:(focus?bounds.top:event.clientY)+20;
  tooltip.style.left=`${Math.max(6,Math.min(innerWidth-tooltip.offsetWidth-8,x))}px`;
  tooltip.style.top=`${Math.max(6,Math.min(innerHeight-tooltip.offsetHeight-8,y))}px`;
}

let panUntil = 0;
document.addEventListener('click', event => {
  const inDiagram=!!event.target.closest?.('#diagram');
  if (inDiagram && (performance.now()<panUntil || toolSpace || tool==='hand'&&!event.target.closest('[data-module-fluid]'))) return;
  if (inDiagram && draft) { closeContext(); finishDraft(event); return; }
  const recipeLink=event.target.closest?.('[data-recipe-link]');
  if (recipeLink) {
    closeContext();
    const id=recipeLink.dataset.itemId||recipeLink.dataset.recipeLink;
    if (event.shiftKey&&recipeLink.dataset.action==='catalog-item') addItem(id);
    else lookupRecipe(id);
    return;
  }
  const target=event.target.closest?.('[data-action]');
  if (!event.target.closest?.('#context-menu') || target) closeContext();
  if (!target || target.disabled) return;
  onAction(target.dataset.action,target,event).catch(error=>{
    if (error.name!=='AbortError') notify(error.message,true);
  });
});

document.addEventListener('change', event => {
  if (event.target.matches('[data-arrange-ports]')) { setArrangePorts(event.target.checked); return; }
  try { applyField(event.target); }
  catch (error) { notify(error.message,true); }
});

document.addEventListener('toggle',event=>{
  const picker=event.target;
  if (!picker.matches?.('.structure-window .water-picker')||!picker.open) return;
  const panel=picker.closest('.structure-window');
  const body=picker.closest('.structure-window-body');
  for (const other of body.querySelectorAll('.water-picker[open]')) if (other!==picker) other.open=false;
  positionWindow(panel,structureWindows.get(Number(panel.dataset.structureWindow)));
  const options=picker.querySelector('.water-options').getBoundingClientRect();
  const bounds=body.getBoundingClientRect();
  body.scrollTop+=Math.max(0,Math.min(options.top-bounds.top,options.bottom-bounds.bottom+4));
},true);

document.addEventListener('input', event => {
  if (event.target.dataset.arrangeWeight&&modal?.kind==='arrange') {
    setArrangeWeights({...modal.weights,[event.target.dataset.arrangeWeight]:Number(event.target.value)});
    return;
  }
  if (event.target.dataset.field==='power-ratio') { updatePowerSlider(event.target); return; }
  const search=event.target.dataset.search;
  if (search==='catalog') {
    catalogQuery=event.target.value;
    catalogPage=0;
    document.querySelector('#catalog-tiles').innerHTML=catalogTiles();
  } else if (search==='recipe') {
    recipeQuery=event.target.value;
    const rows=recipeRows();
    if (!rows.some(row=>row.id===activeRecipe)) activeRecipe=rows[0]?.id||'';
    const active=rows.find(row=>row.id===activeRecipe);
    document.querySelector('#recipe-list').innerHTML=recipeList(rows);
    refreshRecipeSelection(active);
  } else if (search==='splitter') {
    modal.query=event.target.value;
    document.querySelector('#rule-catalog-items').innerHTML=ruleCatalogItems();
  }
});

document.addEventListener('contextmenu', event => {
  if (issueFocus) { event.preventDefault(); return; }
  const recipeLink=event.target.closest?.('[data-recipe-link]');
  if (recipeLink) {
    event.preventDefault();
    lookupRecipe(recipeLink.dataset.itemId||recipeLink.dataset.recipeLink,'usage');
    return;
  }
  const circuit=event.target.closest?.('[data-target-index]');
  if (circuit&&!event.target.closest('input')) {
    event.preventDefault();
    showContext('target',{index:Number(circuit.dataset.targetIndex)},event.clientX,event.clientY);
    return;
  }
  const target=event.target.closest?.('[data-item-context]');
  if (target) { event.preventDefault(); openItemMenu(target,event); return; }
  if (!event.target.closest?.('#diagram,.wire-list')) return;
  event.preventDefault();
  const port=event.target.closest('[data-port]');
  const route=event.target.closest('[data-route]');
  const cell=event.target.closest('[data-action="cell"]');
  const platform=event.target.closest('[data-platform]');
  if (port) showContext('port',{port:port.dataset.port},event.clientX,event.clientY);
  else if (route) showContext('route',{route:route.dataset.route},event.clientX,event.clientY);
  else if (cell) showContext('cell',{slot:Number(cell.dataset.slot),x:Number(cell.dataset.x),y:Number(cell.dataset.y)},event.clientX,event.clientY);
  else if (platform) showContext('cell',{slot:Number(platform.dataset.platform),x:3,y:3},event.clientX,event.clientY);
  else showContext('board',{},event.clientX,event.clientY);
});

document.addEventListener('pointermove', event => {
  if (recipeDividerDrag?.pointerId===event.pointerId) {
    updateRecipeDivider(recipeDividerDrag.width+event.clientX-recipeDividerDrag.x);
  } else if (windowDrag) {
    const {panel,state,x,y,resize,origin}=windowDrag;
    const dx=event.clientX-x,dy=event.clientY-y;
    if (resize) {
      const minWidth=panel===dialog&&modal?.kind==='recipes'?440:285;
      state.width=Math.min(innerWidth-state.x-4,Math.max(minWidth,origin.width+dx));
      state.height=Math.min(innerHeight-state.y-4,Math.max(175,origin.height+dy));
    } else {
      state.x=origin.x+dx;
      state.y=origin.y+dy;
    }
    positionWindow(panel,state);
  } else if (sidebarDrag?.pointerId===event.pointerId) {
    const {side,x,width,other}=sidebarDrag;
    const delta=event.clientX-x;
    resizeDock(side,width+(side==='left'?delta:-delta),other);
  } else if (dragPan?.pointerId===event.pointerId) {
    const dx=event.clientX-dragPan.x;
    const dy=event.clientY-dragPan.y;
    if (!dragPan.moved) {
      if (Math.hypot(dx,dy)<=4) return;
      dragPan.moved=true;
      if (!dragPan.svg.hasPointerCapture(event.pointerId)) dragPan.svg.setPointerCapture(event.pointerId);
      dragPan.svg.classList.add('is-panning');
      hideTooltip();
    }
    camera.x=dragPan.originX-dx*dragPan.scale;
    camera.y=dragPan.originY-dy*dragPan.scale;
    updateView();
    if (draft) updateDraft(event,event.shiftKey);
  } else if (portDrag) updatePortDrag(event);
  else if (routeDrag) moveRouteDrag(event);
  else if (draft && !menuState && event.target.closest?.('#diagram')) updateDraft(event,event.shiftKey);
  else showTooltip(event);
});

document.addEventListener('pointerout', event => {
  if (draft&&event.target.closest?.('#diagram')&&!event.relatedTarget?.closest?.('#diagram')) clearDraftHover();
});

document.addEventListener('pointerdown', event => {
  panUntil=0;
  const recipeDivider=event.target.closest?.('[data-recipe-resize]');
  if (recipeDivider&&event.button===0) {
    event.preventDefault();
    recipeDividerDrag={x:event.clientX,width:dialog.querySelector('#recipe-list').offsetWidth,pointerId:event.pointerId};
    recipeDivider.focus({preventScroll:true});
    recipeDivider.setPointerCapture(event.pointerId);
    hideTooltip();
    return;
  }
  const separator=event.target.closest?.('[data-sidebar-resize]');
  if (separator&&event.button===0) {
    event.preventDefault();
    const side=separator.dataset.sidebarResize;
    const widths=dockSizes();
    sidebarDrag={side,x:event.clientX,width:widths[side],other:widths[otherDock(side)],pointerId:event.pointerId};
    separator.focus({preventScroll:true});
    separator.setPointerCapture(event.pointerId);
    hideTooltip();
    return;
  }
  const panel=event.target.closest?.('#dialog,[data-structure-window],[data-port-window]');
  if (panel && event.button===0) {
    const state=panel===dialog?dialogLayouts.get(modal?.kind):panel.dataset.portWindow?portWindows.get(panel.dataset.portWindow):structureWindows.get(Number(panel.dataset.structureWindow));
    if (!state) return;
    state.z=++windowZ;
    panel.style.zIndex=state.z;
    const handle=event.target.closest('[data-window-grip],[data-window-resize]');
    if (handle&&!state.locked&&!event.target.closest('button')) {
      event.preventDefault();
      windowDrag={panel,state,x:event.clientX,y:event.clientY,resize:handle.hasAttribute('data-window-resize'),
        origin:{x:state.x,y:state.y,width:panel.offsetWidth,height:panel.offsetHeight}};
      handle.setPointerCapture(event.pointerId);
      hideTooltip();
    }
    return;
  }
  const svg=event.target.closest?.('#diagram');
  if (!svg) return;
  const blank=event.target===svg||event.target.closest('[data-action="map-background"]');
  const panTool=event.button===1||(event.button===0&&(tool==='hand'||toolSpace));
  if (panTool || event.button===0&&blank&&!menuState) {
    if (panTool) {
      event.preventDefault();
      svg.setPointerCapture(event.pointerId);
    }
    dragPan={ x:event.clientX,y:event.clientY,originX:camera.x,originY:camera.y,scale:1/svg.getScreenCTM().a,moved:false,svg,pointerId:event.pointerId };
  } else if (event.button===0&&!draft&&!menuState&&tool==='pointer') {
    const port=getPort(event.target.closest('.map-port[data-port]')?.dataset.port);
    if (!port) beginRouteDrag(event,svg,event.target);
    else if (!event.ctrlKey&&!event.metaKey) beginPortDrag(event,svg,port);
  }
});

for (const type of ['pointerup','pointercancel']) document.addEventListener(type, event => {
  windowDrag=null;
  if (recipeDividerDrag?.pointerId===event.pointerId) {
    recipeDividerDrag=null;
    localStorage.setItem('nac.recipeListWidth',String(recipeListWidth));
  }
  if (sidebarDrag?.pointerId===event.pointerId) {
    saveDockWidth(sidebarDrag.side);
    sidebarDrag=null;
  }
  if (portDrag) finishPortDrag(event);
  if (routeDrag) finishRouteDrag(event);
  if (dragPan?.pointerId===event.pointerId) {
    if (dragPan.moved) panUntil=performance.now()+180;
    dragPan.svg.classList.remove('is-panning');
    dragPan=null;
  }
});
document.addEventListener('lostpointercapture',event=>{
  if (portDrag?.pointerId===event.pointerId) cancelPortDrag();
  if (routeDrag?.pointerId===event.pointerId) finishRouteDrag(event);
});
document.addEventListener('focusin',event=>{ if (event.target.matches('[data-tip-heading],[data-water-tier],[data-tip-layer],[data-module-fluid]')) showTooltip(event); });
document.addEventListener('focusout',event=>{ if (event.target.matches('[data-tip-heading],[data-water-tier],[data-tip-layer],[data-module-fluid]')) hideTooltip(); });
window.addEventListener('resize',()=>{
  updateDockSizes();
  fitNewlyVisibleFluids();
  renderStructures();
  renderPortWindows();
  if (dialog.open) positionWindow(dialog,dialogLayouts.get(modal?.kind));
});
document.addEventListener('wheel',event=>{
  if (!event.target.closest?.('#diagram')) return;
  event.preventDefault();
  if (event.deltaY===0) return;
  zoom(event.deltaY<0?1.12:1/1.12,boardPoint(event));
  if (draft && !menuState) updateDraft(event,event.shiftKey);
},{passive:false});

document.addEventListener('dragstart', event => {
  const target=event.target.closest?.('[draggable="true"][data-item-id]');
  if (!target) return;
  hideTooltip();
  event.dataTransfer.setData('application/x-nac-item',target.dataset.itemId);
  if (target.dataset.renamed==='true') event.dataTransfer.setData('application/x-nac-rename','1');
  event.dataTransfer.setData('text/plain',target.dataset.itemId);
  event.dataTransfer.effectAllowed='copy';
});

const dropTarget = target => target.closest?.('[data-drop], [data-action="cell"], [data-action="select-port"]');
document.addEventListener('dragover',event=>{
  const target=dropTarget(event.target);
  if (!target || !event.dataTransfer.types.includes('application/x-nac-item')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect='copy';
  if (!target.classList.contains('drop-active')) {
    document.querySelectorAll('.drop-active').forEach(element=>element.classList.remove('drop-active'));
    target.classList.add('drop-active');
  }
});
document.addEventListener('dragend',()=>document.querySelectorAll('.drop-active').forEach(element=>element.classList.remove('drop-active')));
document.addEventListener('drop',event=>{
  const target=dropTarget(event.target);
  const id=event.dataTransfer.getData('application/x-nac-item');
  if (!target || !items.has(id)) return;
  event.preventDefault();
  target.classList.remove('drop-active');
  const { slot,x,y,port,drop,portOwner }=target.dataset;
  if (port) {
    const entry=getPort(port);
    selection={ slot:entry.slot,x:entry.x,y:entry.y,port:entry.id,route:null };
  } else if (slot!=null) {
    if (Number(slot)>=0&&!project.modules[Number(slot)]) return notify('先给槽位安装结构。');
    selection={ slot:Number(slot),x:Number(x),y:Number(y),port:null,route:null };
  }
  addItem(id,drop==='rule'?'rule':'port',{portId:portOwner||port,renamed:event.dataTransfer.getData('application/x-nac-rename')==='1'});
});

function updateWireModifier(free) {
  if (routeDrag?.moved&&routeDrag.position) updateRouteDrag(routeDrag.position,free);
  else if (draft?.position&&!menuState) updateDraft(draft.position,free);
}

document.addEventListener('keydown',event=>{
  if (portableProjectBusy) { event.preventDefault(); return; }
  if (issueFocus&&!((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s')) {
    if (event.key==='Escape') { event.preventDefault(); exitIssueFocus(); }
    return;
  }
  const fluid=event.target.closest?.('[data-module-fluid]');
  if (fluid&&!draft&&(event.key==='Enter'||event.code==='Space')) {
    event.preventDefault();
    if (!event.repeat) onAction('module-fluid-recipes',fluid,event).catch(error=>notify(error.message,true));
    return;
  }
  if (event.key==='Shift') {
    updateWireModifier(event.shiftKey);
    return;
  }
  if (event.target.matches('[data-recipe-resize]')&&['ArrowLeft','ArrowRight'].includes(event.key)) {
    event.preventDefault();
    const width=dialog.querySelector('#recipe-list').offsetWidth;
    updateRecipeDivider(width+(event.key==='ArrowRight'?16:-16));
    localStorage.setItem('nac.recipeListWidth',String(recipeListWidth));
    return;
  }
  if (event.target.matches('[data-sidebar-resize]')&&['ArrowLeft','ArrowRight'].includes(event.key)) {
    event.preventDefault();
    const side=event.target.dataset.sidebarResize;
    const widths=dockSizes();
    const delta=event.key==='ArrowRight'?16:-16;
    resizeDock(side,widths[side]+(side==='left'?delta:-delta),widths[otherDock(side)]);
    saveDockWidth(side);
    return;
  }
  if ((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s') {
    event.preventDefault();
    if (document.activeElement?.matches('input,textarea')) document.activeElement.blur();
    if (!event.repeat) onAction('save',document.body,event).catch(error=>{
      if (error.name!=='AbortError') notify(error.message,true);
    });
    return;
  }
  if ((event.ctrlKey||event.metaKey)&&!event.altKey&&!event.isComposing&&['z','y'].includes(event.key.toLowerCase())) {
    if (event.target.isContentEditable || event.target.matches('textarea,input:not([type="checkbox"]):not([type="radio"]):not([type="range"])')) return;
    event.preventDefault();
    const redo=event.key.toLowerCase()==='y'||event.shiftKey;
    if (redo?canRedo():canUndo()) seekOperation(operationHistory.cursor+(redo?1:-1));
    return;
  }
  if (menuState) {
    if (event.key==='Escape') { event.preventDefault(); closeContext(); return; }
    if (['ArrowUp','ArrowDown','Home','End'].includes(event.key)) {
      event.preventDefault();
      const buttons=[...contextMenu.querySelectorAll('button:not(:disabled)')];
      const current=buttons.indexOf(document.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:
        (current+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
      buttons[next]?.focus();
    }
    return;
  }
  if (event.key==='Escape'&&CSS.supports('appearance: base-select')&&event.target.closest('.voltage-select:open')) return;
  if (event.key==='Escape'&&dialog.open&&dialog.contains(event.target)) { event.preventDefault(); closeModal(); return; }
  if (event.key.toLowerCase()==='a'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey&&!event.isComposing&&
      (!event.target.matches('input,textarea,select')||event.target.matches('input[type="search"]'))) {
    const tile=document.querySelector('[data-tip-item]:hover')||event.target.closest('[data-tip-item]');
    if (tile&&items.has(tile.dataset.tipItem)) {
      event.preventDefault();
      if (!event.repeat) toggleBookmark(tile.dataset.tipItem);
      return;
    }
  }
  if (event.target.matches('input,textarea,select,button') && event.code==='Space') return;
  if (event.target.matches('input,textarea,select')) return;
  if (event.ctrlKey||event.metaKey||event.altKey||event.isComposing) return;
  if (event.key==='Backspace'&&dialog.contains(event.target)&&recipeTrail.length) { event.preventDefault(); recipeBack(); return; }
  if (event.key==='Backspace'&&draft&&!event.target.isContentEditable&&
      (event.target===document.body||event.target.closest('#diagram,.map-frame'))) {
    event.preventDefault();
    if (!event.repeat&&draft.bends.length>draft.initialBendCount) {
      draft.bends.pop();
      refreshDraft(draft.point,draft.snap,draft.free);
    }
    return;
  }
  if (event.code==='Space') { event.preventDefault(); toolSpace=true; }
  const key=event.key.toLowerCase();
  if (key==='v') selectTool('pointer');
  if (key==='r') selectTool('route');
  if (key==='h') selectTool('hand');
  if (key==='f') fitView();
  if (key==='escape') { if (!draft&&tool==='pointer') drawer='properties'; selectTool('pointer'); }
  const shortcut=Object.entries(preferences.shortcuts).find(([,binding])=>binding===event.key.toUpperCase())?.[0];
  if (shortcut&&!event.repeat) {
    event.preventDefault();
    const action={book:'recipes',target:'choose-recipe',items:'toggle-catalog'}[shortcut];
    onAction(action,document.body,event).catch(error=>notify(error.message,true));
  }
});
document.addEventListener('keyup',event=>{
  if (event.code==='Space') toolSpace=false;
  if (event.key==='Shift') updateWireModifier(event.shiftKey);
});
window.addEventListener('blur',()=>{ toolSpace=false; cancelPortDrag(); dragPan?.svg.classList.remove('is-panning'); dragPan=null; windowDrag=null; sidebarDrag=null; recipeDividerDrag=null; if (routeDrag?.moved) { routeDrag=null; render(); } else routeDrag=null; if (draft?.free) updateWireModifier(false); clearDraftHover(); });
window.addEventListener('beforeunload',event=>{
  if (dirty||saving||webFileSaving||webFilePending()) { event.preventDefault(); event.returnValue=''; }
});
const legacyDesktop = globalThis.chrome?.webview;
let desktopClosing = false;
async function saveBeforeDesktopClose(reply) {
  if (desktopClosing) return;
  desktopClosing=true;
  try {
    if (portableEdition) await portableProjectQueue;
    document.activeElement?.blur();
    while (dirty||saving) await persist();
    reply(true);
  } catch (error) {
    notify(error.message,true);
    reply(false);
  } finally {
    desktopClosing=false;
  }
}
desktop?.onCloseRequest(()=>saveBeforeDesktopClose(desktop.closeResult));
legacyDesktop?.addEventListener('message',event=>{
  if (event.data==='nac:close-request') {
    void saveBeforeDesktopClose(saved=>legacyDesktop.postMessage(saved?'nac:close-ready':'nac:close-blocked'));
  }
});
dialog.addEventListener('cancel',event=>{
  event.preventDefault();
  closeModal();
});

document.addEventListener('submit',async event=>{
  const form=event.target;
  if (!['new-form','route-name-form'].includes(form.id)) return;
  event.preventDefault();
  const formData=new FormData(form);
  try {
    if (form.id==='new-form') {
      const name=String(formData.get('name')||'').trim();
      await switchProject(blankProject(name||'未命名工程'));
    } else {
      const route=getRoute(modal?.id);
      const name=String(formData.get('route-name')||'').trim();
      if (!name) throw Error('请输入线路名称。');
      if (route) { route.name=name.slice(0,64); changed(true,{label:'重命名线路'}); }
      closeModal();
    }
  } catch (error) { notify(error.message,true); }
});

const projectFileInput = document.querySelector('#project-file');
if (webEdition) projectFileInput.accept = '.html,.htm,.nac,.json,text/html,application/json';
else if (portableEdition) projectFileInput.accept = '.html,.htm,text/html';
projectFileInput.addEventListener('change',async event=>{
  const file=event.target.files[0];
  event.target.value='';
  if (!file) return;
  try {
    if (webEdition) { await openWebFile(file); return; }
    if (portableEdition) { await convertPortableHtml(file); return; }
    const raw=JSON.parse(await file.text());
    const imported=prepareProjectImport(raw);
    if (localOnly) {
      await switchProject(imported.project,0,imported.operationHistory,imported.backups);
    } else {
      while (dirty||saving) await persist();
      const saved=await api(`/api/projects/${imported.project.id}`,{...imported,revision:0});
      await switchProject(saved.project,saved.revision,saved.operationHistory);
    }
    notify('工程已导入为独立副本');
  } catch (error) { notify(error.message,true); }
});

document.querySelector('#catalog-file').addEventListener('change',async event=>{
  const file=event.target.files[0];
  event.target.value='';
  if (!file) return;
  try {
    const pack=JSON.parse(await file.text());
    if (!pack || !['items','modules','recipes'].some(key=>Array.isArray(pack[key]))) throw Error('需要含物品、结构或配方列表的数据包。');
    const merged=mergeCatalog(custom||emptyDataset,pack);
    await api('/api/catalog',merged);
    custom=merged;
    dataIndex();
    reports.clear();
    closeModal(); render(); notify(`已导入 ${fmt(pack.items?.length||0)} 项物品、${fmt(pack.recipes?.length||0)} 条配方`);
  } catch (error) { notify(error.message,true); }
});

async function portableStartupSnapshot() {
  const last = localStorage.getItem('nac.lastProject');
  if (last) {
    try { return await api(`/api/projects/${encodeURIComponent(last)}`); }
    catch { localStorage.removeItem('nac.lastProject'); }
  }
  const [first] = await api('/api/projects');
  return first?.fileKey ? desktop.openProject(first.fileKey) : null;
}

async function start() {
  const [base,addon,status,planner]=await Promise.allSettled([
    fetch(webAsset('/data/nac-2.9.0.json')).then(response=>{ if (!response.ok) throw Error('内置数据无法加载'); return response.json(); }),
    api('/api/catalog'),
    api('/api/status'),
    import('./engine.js'),
  ]);
  if (base.status==='fulfilled') builtin={...emptyDataset,...base.value}; else startupWarning='内置数据无法载入';
  if (addon.status==='fulfilled') custom=addon.value;
  if (planner.status==='fulfilled') engine=planner.value;
  else { console.error(planner.reason); startupWarning ||= '验证引擎无法载入'; }
  localOnly=status.status!=='fulfilled';
  if (localOnly) startupWarning ||= '本地工程目录不可用';
  else projectDirectory=portableEdition ? status.value.projects || status.value.data : status.value.data;
  dataIndex();
  if (!webEdition || launchHash || !location.hash.startsWith(projectAddressPrefix)) {
    try {
      if (localOnly) {
        const saved=localStorage.getItem('nac.recovery');
        if (saved) {
          const raw=JSON.parse(saved);
          loadProjectSnapshot(raw.project??raw,raw.operationHistory);
          if (Array.isArray(raw.backups)) localBackups=raw.backups;
        }
      } else {
        let saved;
        if (portableEdition) saved=await portableStartupSnapshot();
        else {
          const id=localStorage.getItem('nac.lastProject') || (await api('/api/projects'))[0]?.id;
          if (id) saved=await api(`/api/projects/${encodeURIComponent(id)}`);
        }
        if (saved) {
          loadProjectSnapshot(saved.project,saved.operationHistory);
          revision=saved.revision;
          if (webEdition) webProjectFile=await getWebProjectFile(project.id);
          if (portableEdition) {
            portableProjectPath=saved.path||'';
            localStorage.setItem('nac.lastProject',project.id);
          }
        }
      }
    } catch { localStorage.removeItem('nac.lastProject'); }
  }
  render();
  if (startupWarning) notify(startupWarning,true);
  if (portableEdition) {
    desktop.onProjectLaunch(key=>{
      void openPortableProject(()=>desktop.openProject(key)).catch(error=>notify(error.message,true));
    });
    await desktop.readyForProjects();
  }
  if (webEdition) {
    window.addEventListener('hashchange',()=>{
      const embedded = takeHtmlLaunchHash();
      if (embedded) void openHtmlLaunch(embedded).catch(error=>notify(error.message,true));
      else if (location.hash.startsWith(projectAddressPrefix)) {
        void followProjectAddress(location.hash).catch(error=>notify(error.message,true));
      }
    });
    try {
      if (launchHash) await openHtmlLaunch(launchHash);
      else if (location.hash.startsWith(projectAddressPrefix)) await followProjectAddress(location.hash);
      else syncProjectAddress();
    } catch (error) {
      notify(error.message,true);
    }
  }
  if (webEdition && typeof window.launchQueue?.setConsumer==='function') {
    let queue=Promise.resolve();
    window.launchQueue.setConsumer(({ files })=>{
      const handle=files?.[0];
      if (handle) queue=queue.then(async()=>openWebFile(await handle.getFile(),handle))
        .catch(error=>notify(error.message,true));
    });
  }
}
void start().catch(error=>{ console.error(error); render(); notify(error.message,true); });
