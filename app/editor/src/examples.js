import { blankProject, makeModule, slotLabel } from './project.js';
import { getPlatform } from './diagram.js';

export const EXAMPLE_FAMILIES = {
  primitive: '原始电路专用 NAC',
  optical: '光学电路专用 NAC',
  special: '特殊电路专用 NAC',
};

const setups = {
  primitive: {
    targets: ['NandChip', 'Microprocessor', 'IntegratedProcessor', 'NanoProcessor', 'QuantumProcessor'],
    slots: { bio: 0, priming: 1, cutting: 2, assembly: 3, wire: 4, parts: 10, board: 11 },
    ratio: 90, tier: 'UEV', amps: 64,
  },
  optical: {
    targets: ['OpticalProcessor', 'OpticalAssembly'],
    slots: { optical: 0, parts: 1, wire: 2, cutting: 3, board: 5, encasing: 6, assembly: 10, splitter: 11 },
    ratio: 60, tier: 'UMV', amps: 32,
  },
  special: {
    targets: ['PicoCircuit'],
    slots: { etching: 0, secondParts: 1, assembly: 2, cutting: 4, encasing: 5, secondEncasing: 6,
      parts: 7, wire: 9, board: 10, splitter: 11, secondBoard: 8 },
    ratio: 80, tier: 'MAX', amps: 128,
  },
};

const dyeOrder = [14, 7, 11, 12, 13, 15, 6, 10, 4, 2, 3, 1, 9, 5, 8, 0];
const guide = 'https://gtnh.huijiwiki.com/wiki/指南:纳米芯片组装复合体自动化/';
const cellOrder = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 0], [2, 0], [3, 0],
  [4, 0], [5, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [1, 6], [2, 6],
  [3, 6], [4, 6], [5, 6], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [1, 2], [2, 2],
  [3, 2], [4, 2], [5, 2], [1, 3], [2, 3], [4, 3], [5, 3], [1, 4], [2, 4], [3, 4],
  [4, 4], [5, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 5]];

function itemInputs(recipe, items) {
  return recipe.inputs.filter((input) => items.get(input.item)?.kind !== 'fluid' && !input.continuous);
}

export function makeExampleProject(dataset, family) {
  const setup = setups[family];
  if (!setup) throw Error('未知的示例系列');
  const project = blankProject(EXAMPLE_FAMILIES[family]);
  project.power = { mode: 'amps', eu: null, amps: setup.amps, tier: setup.tier,
    ratio: setup.ratio, calibration: { family, level: 3 } };
  const title = { primitive: '原始', optical: '光学', special: '特殊' }[family];
  const notes = {
    primitive: '两台组装矩阵分别负责预充能与成品，五种原始电路共用加工支路。可在右侧切换各电路的验证结果。',
    optical: '分流器将成品送回控制室、未整理产物送往组织器返工。光学处理器也可作为光学集群的外部进料。',
    special: '外部输入光学主机电路；两台全板浸没设备分别供应海晶酸与 UU 物质。部分贴片元件以重命名标识送往分流器。',
  };
  project.notes = `${notes[family]}\n中文维基参考：${guide}${title}`;
  const items = new Map(dataset.items.map((item) => [item.id, item]));
  const modules = new Map(dataset.modules.map((module) => [module.id, module]));
  const real = new Map(dataset.items.filter((item) => item.component).map((item) => [item.component, item.id]));
  const byProduct = new Map();
  for (const recipe of dataset.recipes.filter((recipe) => recipe.module !== 'conversion')) {
    for (const output of recipe.outputs) {
      if (!byProduct.has(output.item)) byProduct.set(output.item, []);
      byProduct.get(output.item).push(recipe);
    }
  }
  const routeKeys = new Map();
  const lanes = new Map();

  function prepare(slot, type, recipe) {
    const module = project.modules[slot] || makeModule(type);
    module.isolate = false;
    if (type === 'assembly') module.casingTier = family === 'primitive' ? 8 : family === 'optical' ? 9 : 10;
    if (type === 'board') {
      module.fluid = recipe?.inputs.find((input) => items.get(input.item)?.boardFluidTier === recipe.boardFluidTier)?.item
        || [...items.values()].find((item) => item.boardFluidTier === recipe.boardFluidTier)?.id;
      module.config.impurity = 15;
    }
    if (type === 'cutting') module.waterTier = family === 'special' ? 6 : family === 'optical' ? 4 : 2;
    if (type === 'optical') module.config.waterTiers = [6, 8];
    if (type === 'etching') Object.assign(module.config, { laserTier: 'UXV', laserAmps: 1024 });
    if (type === 'superconductor') module.fluid = 'fluid:SuperCoolant';
    project.modules[slot] = module;
    return module;
  }

  function location(slot, peer) {
    const local = getPlatform(slot);
    const target = getPlatform(peer);
    const dx = target.cx - local.cx;
    const dy = target.cy - local.cy;
    const faces = Math.abs(dx) > Math.abs(dy) ? [dx < 0 ? 'w' : 'e', dy < 0 ? 'n' : 's']
      : [dy < 0 ? 'n' : 's', dx < 0 ? 'w' : 'e'];
    const distance = ([x, y], face) => ({ n: y, e: 6 - x, s: 6 - y, w: x })[face];
    const used = project.ports.filter((port) => port.slot === slot);
    const mask = modules.get(project.modules[slot]?.type)?.portMask || cellOrder;
    const available = mask.filter(([x, y]) => !used.some((port) => port.x === x && port.y === y));
    available.sort((a, b) => distance(a, faces[0]) - distance(b, faces[0]) ||
      distance(a, faces[1]) - distance(b, faces[1]));
    if (!available.length) throw Error('示例缺少可放置真空端口的位置');
    const [x, y] = available[0];
    const facing = [...new Set([...faces, 'n', 'e', 's', 'w'])].find((face) => distance([x, y], face) === 0) || 'down';
    return { x, y, facing };
  }

  function pickColor(source, target, group = '') {
    const key = `${source}/${target}/${group}`;
    if (!lanes.has(key)) lanes.set(key, lanes.size);
    return lanes.get(key);
  }

  function connect(source, target, color, item, { renamed = false, layer } = {}) {
    const key = `${source}/${target}/${color}`;
    let pair = routeKeys.get(key);
    if (!pair) {
      const from = { id: `p-${project.ports.length + 1}`, slot: source, kind: source === -1 ? 'feed' : 'out',
        color, items: [], ...location(source, target) };
      project.ports.push(from);
      const to = { id: `p-${project.ports.length + 1}`, slot: target, kind: target === -1 ? 'final' : 'in',
        color, items: [], ...location(target, source) };
      project.ports.push(to);
      project.routes.push({ id: `r-${project.routes.length + 1}`, from: from.id, to: to.id,
        layer: layer ?? (project.routes.length % 4) });
      pair = { from, to };
      routeKeys.set(key, pair);
    }
    const mark = (port, id) => {
      if (!port.items.some((existing) => existing.item === id && Boolean(existing.renamed) === renamed)) {
        port.items.push({ item: id, renamed });
      }
    };
    mark(pair.from, source === -1 ? real.get(item) : item);
    mark(pair.to, target === -1 ? (real.get(item) || item) : item);
    return pair;
  }

  function chooseRecipe(item, allowed) {
    const recipes = (byProduct.get(item) || []).filter((recipe) => !allowed || recipe.module === allowed);
    if (!recipes.length) throw Error(`示例缺少 ${item} 的配方`);
    const water = family === 'special' ? 6 : family === 'optical' ? 4 : 2;
    return recipes.find((recipe) => recipe.waterTier === water) || recipes[0];
  }

  function slotOf(recipe) {
    if (recipe.outputs[0].item === 'PrimedUnattunedCircuitry') return setup.slots.priming;
    if (family === 'special' && recipe.module === 'board' && recipe.boardFluidTier === 5) return setup.slots.secondBoard;
    if (family === 'special' && recipe.outputs[0].item === 'BoardPico') return setup.slots.secondParts;
    if (family === 'special' && recipe.outputs[0].item === 'ProcessedFoilRadoxPolymer') return setup.slots.secondEncasing;
    return setup.slots[recipe.module];
  }

  const completed = new Set();
  function emit(item, receiver, color, options = {}) {
    if (!options.force && real.has(item)) {
      if (family === 'special' && item === 'OpticalSMDInductor') {
        const slot = setup.slots.splitter;
        const splitter = prepare(slot, 'splitter');
        const sourceColor = pickColor(-1, slot);
        connect(-1, slot, sourceColor, item, { renamed: true });
        const outputColor = color ?? pickColor(slot, receiver);
        connect(slot, receiver, outputColor, item, { renamed: true });
        const existing = splitter.rules.find((rule) => rule.inputs.includes(sourceColor));
        if (existing) {
          if (!existing.outputs.includes(outputColor)) existing.outputs.push(outputColor);
        } else {
          splitter.rules.push({ mode: 'items', inputs: [sourceColor], items: [{ item: real.get(item), renamed: true }],
            outputs: [outputColor], redstone: { channel: 0, level: 0 } });
        }
        return outputColor;
      }
      const paint = color ?? pickColor(-1, receiver);
      const renamed = family === 'special' && /^OpticalSMD/.test(item) && options.outputSlot === setup.slots.secondParts;
      connect(-1, receiver, paint, item, { renamed });
      return paint;
    }
    const recipe = chooseRecipe(item, options.module);
    const slot = slotOf(recipe);
    if (slot == null) throw Error(`示例未安排 ${recipe.module} 的安装位置`);
    prepare(slot, recipe.module, recipe);
    const paint = color ?? pickColor(slot, receiver);
    connect(slot, receiver, paint, item);
    const key = `${recipe.id}/${slot}/${paint}`;
    if (completed.has(key)) return paint;
    completed.add(key);
    for (const [index, input] of itemInputs(recipe, items).entries()) {
      emit(input.item, slot, index === 0 ? paint : undefined, { outputSlot: receiver });
    }
    return paint;
  }

  for (const item of setup.targets) {
    if (!real.has(item)) throw Error(`缺少电路物品 ${item}`);
    project.circuits.push({ item: real.get(item), quantity: family === 'primitive' ? 64 : family === 'optical' ? 8 : 2 });
    if (family !== 'optical') {
      emit(item, -1, undefined, { force: true, module: 'assembly' });
      continue;
    }
    const slot = setup.slots.splitter;
    const organizer = setup.slots.optical;
    const splitter = prepare(slot, 'splitter');
    prepare(organizer, 'optical');
    const assembly = chooseRecipe(item, 'assembly');
    const alternate = assembly.alternateOutputs[0].item;
    const assembled = emit(item, slot, pickColor(setup.slots.assembly, slot, item), { force: true, module: 'assembly' });
    connect(setup.slots.assembly, slot, assembled, alternate);
    const recovery = pickColor(slot, organizer);
    connect(organizer, -1, recovery, item);
    connect(slot, organizer, recovery, alternate);
    const direct = pickColor(slot, -1);
    connect(slot, -1, direct, item);
    for (const [filtered, output] of [[item, direct], [alternate, recovery]]) {
      splitter.rules.push({ mode: 'items', inputs: [assembled], items: [{ item: filtered, renamed: false }],
        outputs: [output], redstone: { channel: 0, level: 0 } });
    }
  }
  const conflicts = Array.from({ length: lanes.size }, () => new Set());
  for (const slot of [-1, ...project.modules.keys()]) {
    const outputs = project.ports.filter((port) => port.slot === slot && ['feed', 'out'].includes(port.kind));
    for (const port of outputs) {
      for (const other of outputs) {
        if (port === other) continue;
        if (port.color === other.color) throw Error(`示例中${slot===-1?'主体控制室':`槽位 ${slotLabel(slot)}`}的同一染色通道连接了两个输出端口`);
        conflicts[port.color].add(other.color);
      }
    }
  }
  const assigned = new Map();
  const order = [...conflicts.keys()].sort((a, b) => conflicts[b].size - conflicts[a].size);
  for (const lane of order) {
    const excluded = new Set([...conflicts[lane]].map((other) => assigned.get(other)));
    const color = dyeOrder.find((paint) => !excluded.has(paint));
    if (color == null) throw Error('示例的同模块染色通道超出可用颜色');
    assigned.set(lane, color);
  }
  for (const port of project.ports) port.color = assigned.get(port.color);
  for (const module of project.modules.filter(Boolean)) {
    for (const rule of module.rules) {
      rule.inputs = rule.inputs.map((lane) => assigned.get(lane));
      rule.outputs = rule.outputs.map((lane) => assigned.get(lane));
    }
  }
  return project;
}
