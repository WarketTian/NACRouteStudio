// GT5-Unofficial 5.09.54.265: MTENanochipAssemblyComplex, MTENanochipAssemblyModuleBase,
// CircuitCalibration and each module's validateRecipe/transformRecipe implementation.
import { selectedRecipeFor, splitterRuleMatches } from './module-recipes.js';
import { isPortCell } from './port-layout.js';
import { isInput, isOutput, matchingPortDyes } from './port-connection.js';
import { calibrationSelection } from './calibration.js';
import { assemblyPowerMultiplier, biologicalFluidMultiplier, etchingDivisors, immersionDurationMultiplier, opticalWaterBoost, opticalWaterEffects, opticalWaterTiers } from './module-boosts.js';

export const VOLTAGES = Object.freeze({
  ULV: 8, LV: 32, MV: 128, HV: 512, EV: 2048, IV: 8192, LuV: 32768, ZPM: 131072,
  UV: 524288, UHV: 2097152, UEV: 8388608, UIV: 33554432, UMV: 134217728,
  UXV: 536870912, MAX: 2147483640,
});

const tiers = Object.keys(VOLTAGES);
const voltages = Object.values(VOLTAGES);
const names = { primitive: '原始', crystal: '晶体', wetware: '湿件', bio: '生物', optical: '光学', special: '特殊' };
const directions = new Set(['n', 'e', 's', 'w', 'up', 'down']);
const colorIsValid = (color) => Number.isInteger(color) && color >= 0 && color <= 15;
const tierIndex = (tier) => tier === '' || tier == null ? -1 : Number.isInteger(Number(tier))
  ? (voltages[Number(tier)] ? Number(tier) : -1)
  : tiers.findIndex((key) => key.toUpperCase() === String(tier).toUpperCase());
const inputList = (recipe) => [...(recipe.inputs || []), ...(recipe.fluids || [])];
const positive = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const materialKey = (item, renamed) => JSON.stringify([item, Boolean(renamed)]);
const inventoryKey = (port, item, renamed) => JSON.stringify([port, item, Boolean(renamed)]);

function status(code, slot, message, details = {}) {
  return { severity: 'error', code, slot, message, ...details };
}

function warning(code, slot, message, details = {}) {
  return status(code, slot, message, { severity: 'warning', ...details });
}

function waterSettings(module) {
  return opticalWaterTiers(module).map(Number).filter(Boolean);
}

function readPower(power = {}) {
  const issues = [];
  const tier = tierIndex(power.tier);
  if (tier < 0) issues.push(status('power-tier', -1, '请选择能源仓的电压等级。'));
  let total = 0;
  if (power.mode === 'amps') {
    if (!positive(power.amps)) issues.push(status('power-amps', -1, '请输入大于 0 的整数安培数。'));
    if (tier >= 0 && positive(power.amps)) total = voltages[tier] * Number(power.amps);
  } else {
    if (!positive(power.eu)) issues.push(status('power-eu', -1, '请输入大于 0 的整数输入功率（EU/t）。'));
    if (positive(power.eu)) total = Number(power.eu);
  }
  if (total && !Number.isSafeInteger(total)) issues.push(status('power-range', -1, '输入功率超出可精确计算的范围。'));
  const ratio = power.ratio == null || power.ratio === '' ? null : Number(power.ratio);
  if (!Number.isInteger(ratio) || ratio < 1 || ratio > 99) {
    issues.push(status('power-ratio', -1, '组装矩阵的供电比例应为 1% 至 99% 的整数。'));
  }
  const calibration = power.calibration;
  if (calibration == null || calibration === '') {
    issues.push(status('power-calibration', -1, '请选择 NAC 校准等级，可以选择无校准。'));
  } else {
    const value = typeof calibration === 'object' ? Number(calibration.level) : Number(calibration);
    if (!Number.isInteger(value) || value < 0 || value > 3) issues.push(status('power-calibration', -1, '校准等级应为 0 至 3。'));
  }
  return { total, tier, ratio, issues };
}

function makeGraph(project) {
  const ports = new Map();
  const entries = new Map();
  const inbound = new Map();
  const outbound = new Map();
  const issues = [];
  for (const port of project.ports || []) {
    if (ports.has(port.id)) {
      issues.push(status('duplicate-port', port.slot, '图纸存在重复的端口编号。'));
      continue;
    }
    if ((port.slot !== -1 && !project.modules[port.slot]) ||
        (port.slot === -1 && !['feed', 'final'].includes(port.kind)) ||
        (port.slot !== -1 && !['in', 'out'].includes(port.kind))) {
      issues.push(status('port-type', port.slot, '端口类型与所在位置不匹配。', { port:port.id }));
      continue;
    }
    if (!colorIsValid(port.color) || !directions.has(port.facing)) {
      issues.push(status('port-settings', port.slot, '请为真空传送端口设置有效的染色和朝向。', { port:port.id }));
      continue;
    }
    if (!isPortCell(port.slot,port.x,port.y)) {
      issues.push(status('port-position', port.slot, '真空传送端口不在组件底板的有效格内。', { port: port.id }));
      continue;
    }
    ports.set(port.id, port);
    if (!entries.has(port.slot)) entries.set(port.slot, []);
    entries.get(port.slot).push(port);
  }
  for (const route of project.routes || []) {
    const source = ports.get(route.from);
    const target = ports.get(route.to);
    if (source && route.to == null && Number.isFinite(route.looseEnd?.x) && Number.isFinite(route.looseEnd?.y)) {
      issues.push(warning('loose-end', source.slot, `${route.name || '这条线路'}的端点尚未锚定。`, { route:route.id }));
      continue;
    }
    if (!isOutput(source) || !isInput(target)) {
      issues.push(status('route-direction', target?.slot ?? source?.slot ?? null, '管道需要从输出端口连到输入端口。', { route: route.id }));
    } else if (!matchingPortDyes(source, target, route.color)) {
      issues.push(status('route-color', target.slot, '管道两端与管道本身必须使用同一种染色。', { route: route.id }));
    } else {
      if (!inbound.has(target.id)) inbound.set(target.id, []);
      if (!inbound.get(target.id).some((entry) => entry.id === source.id)) inbound.get(target.id).push(source);
      if (!outbound.has(source.id)) outbound.set(source.id, []);
      if (!outbound.get(source.id).some((entry) => entry.id === target.id)) outbound.get(source.id).push(target);
    }
  }
  const seen = new Set();
  for (const id of outbound.keys()) {
    if (seen.has(id)) continue;
    const queue = [id];
    const sources = [];
    const targets = [];
    for (const node of queue) {
      if (seen.has(node)) continue;
      seen.add(node);
      if (outbound.has(node)) {
        sources.push(ports.get(node));
        queue.push(...outbound.get(node).map((port) => port.id));
      } else {
        targets.push(ports.get(node));
        queue.push(...(inbound.get(node) || []).map((port) => port.id));
      }
    }
    if (sources.length > 1) {
      for (const port of targets) {
        issues.push(status('multiple-output-hatches', port.slot, '同一真空传送网络连接了多个输出端口。游戏中的输入端口只能从唯一的输出端口接收组件。', { port:port.id }));
        inbound.set(port.id, []);
      }
      for (const source of sources) outbound.set(source.id, []);
    } else if (targets.length > 1) {
      issues.push(warning('shared-network', sources[0].slot, '同一输出端口连接了多个输入端口。实际传送顺序可能影响各支路供货，可使用纳米组件分流器明确分配。', { port:sources[0].id }));
    }
  }
  for (const [slot, localPorts] of entries) {
    if (project.modules[slot]?.type === 'splitter') continue;
    const byColor = new Map();
    for (const port of localPorts.filter(isOutput)) {
      if (!byColor.has(port.color)) byColor.set(port.color, []);
      byColor.get(port.color).push(port.id);
    }
    for (const ports of byColor.values()) {
      if (ports.length > 1) issues.push(status('duplicate-output-color', slot,
        '同一模块有多个同色真空输出端口。普通加工模块只会选择其中一个，请用分流器分配。', { ports }));
    }
  }
  return { ports, entries, inbound, outbound, issues };
}

function resolveModule(recipe, module, calibration, items, definitions) {
  const check = (code, message) => ({ code, message });
  const type = module.type;
  if (type === 'assembly') {
    const actual = tierIndex(module.casingTier);
    const required = tierIndex(recipe.casingTier ?? 1);
    if (actual < 0) return check('missing-casing', '请选择部件装配线外壳等级。');
    if (actual < required) return check('casing-tier', `配方要求至少 ${tiers[required]} 级部件装配线外壳，当前为 ${tiers[actual]}。`);
  }
  if (type === 'cutting') {
    const water = Number(module.waterTier || 0);
    const isVariable = recipe.waterTier || recipe.outputs.some((output) => /framebox/i.test(output.item));
    const fluid = module.fluid;
    if (isVariable && fluid && recipe.cuttingFluid && fluid !== recipe.cuttingFluid) {
      return check('cutting-fluid', `所选切割液不匹配这条配方，所需流体为 ${items.get(recipe.cuttingFluid)?.name || recipe.cuttingFluid}。`);
    }
    if (isVariable && !fluid && water && recipe.cuttingFluid && water !== (recipe.waterTier || 0)) {
      return check('cutting-water', `所选净化水不匹配这条配方，所需切割液为 ${items.get(recipe.cuttingFluid)?.name || recipe.cuttingFluid}。`);
    }
    if (!fluid && !water && recipe.cuttingFluid && recipe.waterTier) {
      return check('missing-cutting-water', '请选择纳米精度切割仓使用的净化水等级或切割液。');
    }
  }
  if (type === 'optical') {
    const water = waterSettings(module);
    if (water.length !== 2 || water[0] === water[1] || water.some((tier) => !opticalWaterBoost(tier))) {
      return check('optical-water', '请选择两种不同等级的净化水（3～8 级）。');
    }
  }
  if (type === 'board' && recipe.boardFluidTier) {
    const expected = [...items.values()].find((item) => item.boardFluidTier === recipe.boardFluidTier);
    if (!module.fluid) return check('missing-immersion-fluid', '请选择全板浸没设备所用的浸没液。');
    if ((items.get(module.fluid)?.boardFluidTier ?? Number(module.fluid)) !== recipe.boardFluidTier) {
      return check('immersion-fluid', `浸没液不匹配，所需流体为 ${expected?.name || '此配方的指定浸没液'}。`);
    }
    if (module.config?.impurity != null && (!Number.isFinite(Number(module.config.impurity)) ||
        Number(module.config.impurity) < 0 || Number(module.config.impurity) >= 100)) {
      return check('immersion-impurity', '请将杂质率设置在 0% 至 100% 以下；完全污染时设备不能加工。');
    }
  }
  if (type === 'superconductor' && module.fluid !== 'fluid:SuperCoolant' && !module.config?.coolant) {
    return check('missing-coolant', '超导线束分离器需要持续供应超级冷却液。');
  }
  if (type === 'etching') {
    const amps = Number(module.config?.laserAmps);
    const tier = tierIndex(module.config?.laserTier);
    const hatches = definitions.get(type)?.options?.laserHatches;
    if (!positive(amps) || tier < 0) {
      return check('missing-laser', '请设置镭射源仓的电压和安培数。');
    }
    if (tier < 5 || amps < 256 || (hatches?.length && !hatches.some((hatch) => tierIndex(hatch.tier) === tier && hatch.amps === amps))) {
      return check('laser-hatch', '此电压与安培数组合没有对应的镭射源仓。最低为 IV 256 A。');
    }
  }
  if (Array.isArray(module.config?.fluids)) {
    const required = inputList(recipe).filter((input) => !input.continuous && items.get(input.item)?.kind === 'fluid' &&
      fluidDose(input, module, calibration) > 0);
    const missing = required.filter((input) => !module.config.fluids.includes(input.item));
    if (missing.length) return check('missing-recipe-fluid', `模块的流体供给缺少 ${missing.map((input) => items.get(input.item)?.name || input.item).join('、')}。`);
  }
  return null;
}

function modifier(recipe, module, calibration) {
  const type = module.type;
  const { family, level } = calibration;
  const regularCalibration = ['crystal', 'wetware', 'bio', 'optical'].includes(family);
  let eu = recipe.eu * (regularCalibration && level > 0 ? 0.8 : 1);
  let ticks = recipe.ticks;
  let waterDiscount = 1;
  if (type === 'assembly') eu *= assemblyPowerMultiplier(tierIndex(module.casingTier), tierIndex(recipe.casingTier ?? 1));
  if (type === 'optical') {
    const { multipliers } = opticalWaterEffects(waterSettings(module), calibration);
    waterDiscount = multipliers.water;
    ticks *= multipliers.ticks;
    eu *= multipliers.eu;
  }
  if (type === 'board') ticks *= immersionDurationMultiplier(Number(module.config?.impurity ?? 0));
  if (type === 'etching') {
    const divisors = etchingDivisors(tierIndex(module.config.laserTier), Number(module.config.laserAmps), calibration);
    eu /= divisors.eu;
    ticks /= divisors.ticks;
  }
  const recipeFamily = recipe.calibration === 'bioware' ? 'bio' : recipe.calibration;
  if (recipeFamily === family) {
    if (regularCalibration && level >= 2) ticks *= 0.8;
    if (family === 'special' && level > 0) {
      const duration = [1, 0.8, 0.6, 0.5][level];
      ticks *= duration;
      eu /= Math.max(0.1, 1 - duration);
    }
  }
  return { eu, ticks, waterDiscount };
}

function fluidDose(input, module, calibration) {
  if (module.type === 'bio') {
    const multiplier = biologicalFluidMultiplier(calibration);
    if (multiplier !== 1) return Math.floor(input.amount * multiplier);
  }
  return input.amount;
}

function blankPlan() {
  return { materials: new Map(), omitted: [], steps: [], flows: [], supply: new Map(), split: new Map(), issues: [] };
}

function copyPlan(plan) {
  return {
    materials: new Map(plan.materials), omitted: [...plan.omitted], steps: [...plan.steps], flows: [...plan.flows],
    supply: new Map(plan.supply), split: new Map(plan.split), issues: [...plan.issues],
  };
}

function addMaterial(plan, item, amount, renamed, kind, details = {}) {
  if (!amount) return;
  const key = materialKey(item, renamed);
  const previous = plan.materials.get(key);
  plan.materials.set(key, { item, amount: (previous?.amount || 0) + amount, renamed, kind, ...details });
}

function recordFluids(plan, recipe, module, slot, batches, calibration, items) {
  const required = inputList(recipe).filter((input) => items.get(input.item)?.kind === 'fluid');
  for (const input of required) {
    const amount = fluidDose(input, module, calibration) * batches;
    if (input.continuous || module.ignoreMaterials) {
      plan.omitted.push({ item: input.item, amount: input.continuous ? null : amount, slot,
        reason: input.continuous ? '运行期间持续供应' : '已忽略模块流体' });
    } else addMaterial(plan, input.item, amount, false, 'fluid');
  }
  if (module.type === 'optical' || module.type === 'superconductor') {
    const fluids = module.type === 'optical'
      ? waterSettings(module).map((tier) => `fluid:Grade${tier}PurifiedWater`) : ['fluid:SuperCoolant'];
    for (const item of fluids) plan.omitted.push({ item, amount: null, slot, reason: '运行期间持续供应' });
  }
}

function accepts(port, item, componentOf, renamed) {
  return !port.items?.length || port.items.some((entry) => componentOf(entry.item) === item &&
    (renamed == null || Boolean(entry.renamed) === renamed));
}

function routePlanner(project, dataset, graph, items, calibration, circuit) {
  const components = new Map(dataset.items.filter((item) => item.component).map((item) => [item.id, item.component]));
  const definitions = new Map(dataset.modules.map((module) => [module.id, module]));
  const componentOf = (item) => components.get(item) || item;
  const byProduct = new Map();
  for (const recipe of dataset.recipes) {
    if (recipe.module === 'conversion') continue;
    for (const output of [...(recipe.outputs || []), ...(recipe.alternateOutputs || [])]) {
      const item = componentOf(output.item);
      if (!byProduct.has(item)) byProduct.set(item, []);
      byProduct.get(item).push({ recipe, output });
    }
  }
  const wanted = componentOf(circuit.item);
  const failed = new Map();
  let visits = 0;
  const remember = (issue, depth) => {
    const key = JSON.stringify([issue.code, issue.slot, issue.item, issue.recipe, issue.message]);
    const previous = failed.get(key);
    if (!previous || previous.depth > depth) failed.set(key, { issue, depth });
  };

  function supplyThrough(ports, item, amount, plan, path, renamed) {
    for (const port of ports) {
      for (const source of graph.inbound.get(port.id) || []) {
        const trial = copyPlan(plan);
        const next = supply(source, item, amount, trial, path, renamed);
        if (next) {
          next.flows.push({ from: source.id, to: port.id, item, amount });
          return next;
        }
      }
    }
    return null;
  }

  function supplySplit(port, module, item, amount, plan, path, requestedName) {
    const modulePorts = graph.entries.get(port.slot) || [];
    const inputs = modulePorts.filter((entry) => entry.kind === 'in');
    const filters = requestedName == null ? [false, true] : [requestedName];
    for (const renamed of filters) {
      if (!accepts(port, item, componentOf, renamed)) continue;
      for (const input of inputs) {
        if (!accepts(input, item, componentOf, renamed)) continue;
        const colors = new Set((module.rules || [])
          .filter((rule) => splitterRuleMatches(rule, input.color, item, renamed, module.config, componentOf))
          .flatMap((rule) => rule.outputs || []));
        if (!colors.has(port.color)) continue;
        const outputs = modulePorts.filter((entry) => entry.kind === 'out' && colors.has(entry.color));
        const groups = new Set(outputs.map((entry) => entry.color));
        const sameColor = outputs.filter((entry) => entry.color === port.color);
        const factor = groups.size * sameColor.length;
        const groupKey = inventoryKey(input.id, item, renamed);
        const previous = plan.split.get(groupKey) || { count: 0, demands: {} };
        const demands = { ...previous.demands, [port.id]: (previous.demands[port.id] || 0) + amount };
        // Budget complete rounds so the calculation does not rely on game hatch iteration order.
        const needed = Math.max(...Object.entries(demands).map(([id, demand]) => {
          const color = graph.ports.get(id).color;
          return demand * groups.size * outputs.filter((entry) => entry.color === color).length;
        }));
        const trial = copyPlan(plan);
        const next = needed === previous.count ? trial
          : supplyThrough([input], item, needed - previous.count, trial, path, renamed);
        if (!next) continue;
        next.split.set(groupKey, { count: needed, demands });
        if (factor > 1 && !next.issues.some((issue) => issue.code === 'split-buffer' && issue.slot === port.slot)) {
          next.issues.push(warning('split-buffer', port.slot, '分流按颜色组及同色输出端口均分。材料已按完整分配轮次预留，少量投料可能因余数顺序暂时滞留。'));
        }
        return next;
      }
    }
    remember(status('splitter-route', port.slot, `没有可供给该出口的分流规则或上游物料，请检查输入染色、重命名、红石信号和输出颜色。`, { item, port:port.id }), path.size);
    return null;
  }

  function supply(port, item, amount, plan, path, requestedName) {
    if (++visits > 15000) {
      remember(status('analysis-limit', port.slot, '搜索达到上限，请缩小当前电路的配方与回流分支。', { item }), path.size);
      return null;
    }
    const signature = inventoryKey(port.id, item, requestedName);
    if (path.has(signature)) return null;
    const nextPath = new Set(path).add(signature);
    if (port.kind === 'feed') {
      const record = (port.items || []).find((entry) =>
        components.get(entry.item) === item && (requestedName == null || Boolean(entry.renamed) === requestedName));
      if (!record) return null;
      addMaterial(plan, record.item, amount, Boolean(record.renamed), 'item');
      return plan;
    }
    const module = project.modules[port.slot];
    if (module.type === 'splitter') return supplySplit(port, module, item, amount, plan, nextPath, requestedName);
    if (requestedName) return null;
    if (!accepts(port, item, componentOf)) return null;
    const spare = plan.supply.get(signature) || 0;
    if (spare >= amount) {
      plan.supply.set(signature, spare - amount);
      return plan;
    }
    const selected = selectedRecipeFor(module, item);
    const available = (byProduct.get(item) || []).filter(({ recipe }) =>
      recipe.module === module.type && (!selected || selected === recipe.id));
    const modulePorts = (graph.entries.get(port.slot) || []).filter((entry) => entry.kind === 'in');
    const desired = amount - spare;
    for (const { recipe, output } of available) {
      const recipeItems = inputList(recipe).filter((input) => items.get(input.item)?.kind !== 'fluid' && !input.continuous);
      if (!recipeItems.length || !output.amount) continue;
      const trial = copyPlan(plan);
      const batches = Math.ceil(desired / output.amount);
      let next = trial;
      for (const [index, input] of recipeItems.entries()) {
        const ports = index === 0 || (module.isolate ?? module.type !== 'assembly')
          ? modulePorts.filter((entry) => entry.color === port.color) : modulePorts;
        const choices = [input, ...(input.alternatives || [])];
        const prior = next;
        next = choices.reduce((result, choice) => result || supplyThrough(
          ports.filter((entry) => accepts(entry, componentOf(choice.item), componentOf)),
          componentOf(choice.item), (choice.amount ?? input.amount) * batches, prior, nextPath,
        ), null);
        if (!next) {
          remember(status('missing-ingredient', port.slot, `输入端口收不到 ${items.get(input.item)?.name || input.item}。检查上游产物、管道及${index === 0 ? '首个配方原料的来源颜色' : '输入隔离设置'}。`, {
            item: input.item, recipe: recipe.id, ports:ports.map(entry=>entry.id),
          }), nextPath.size);
          break;
        }
      }
      if (!next) continue;
      const check = resolveModule(recipe, module, calibration, items, definitions);
      if (check) {
        remember(status(check.code, port.slot, check.message, { item, recipe: recipe.id }), nextPath.size);
        continue;
      }
      recordFluids(next, recipe, module, port.slot, batches, calibration, items);
      next.steps.push({ slot: port.slot, recipe: recipe.id, batches, outputPort: port.id, product: item });
      next.supply.set(signature, batches * output.amount - desired);
      for (const other of recipe.outputs || []) {
        const product = componentOf(other.item);
        const chosen = selectedRecipeFor(module, product);
        if (product === item || recipe.alternateOutputs?.length || (chosen && chosen !== recipe.id)) continue;
        const key = inventoryKey(port.id, product, undefined);
        next.supply.set(key, (next.supply.get(key) || 0) + batches * other.amount);
      }
      return next;
    }
    if (!available.length) {
      const name = items.get(item)?.name || item;
      const issue = selected
        ? status('selected-recipe', port.slot, `已选配方无法产出 ${name}，请在组件配方中更新选择。`, { item, recipe: selected })
        : status('wrong-module', port.slot, `此模块没有产出 ${name} 的配方。`, { item });
      remember(issue, nextPath.size);
    }
    return null;
  }

  function checkRandomBranches(plan) {
    const recipeIndex = new Map(dataset.recipes.map((recipe) => [recipe.id, recipe]));
    const seen = new Set();
    const failures = [];
    for (const step of plan.steps) {
      const recipe = recipeIndex.get(step.recipe);
      if (!recipe.alternateOutputs?.length) continue;
      const key = JSON.stringify([step.slot, step.recipe, step.outputPort]);
      if (seen.has(key)) continue;
      seen.add(key);
      const normal = componentOf(recipe.outputs[0].item);
      const sinks = new Set(plan.flows.filter((flow) => flow.item === normal).map((flow) => flow.to));
      if (normal === wanted) for (const port of finals) sinks.add(port.id);

      function reaches(portId, item, path) {
        const key = inventoryKey(portId, item, false);
        if (path.has(key) || !accepts(graph.ports.get(portId), item, componentOf)) return false;
        const nextPath = new Set(path).add(key);
        for (const input of graph.outbound.get(portId) || []) {
          if (item === normal && sinks.has(input.id) && accepts(input, item, componentOf)) return true;
          if (input.slot === -1 || !accepts(input, item, componentOf)) continue;
          const module = project.modules[input.slot];
          const outputs = (graph.entries.get(input.slot) || []).filter((port) => port.kind === 'out');
          if (module.type === 'splitter') {
            const colors = new Set((module.rules || [])
              .filter((rule) => splitterRuleMatches(rule, input.color, item, false, module.config, componentOf))
              .flatMap((rule) => rule.outputs || []));
            if (outputs.some((port) => colors.has(port.color) && reaches(port.id, item, nextPath))) return true;
          } else if (item !== normal && module.type === 'optical') {
            const selected = selectedRecipeFor(module, normal);
            const recoveries = (byProduct.get(normal) || []).filter(({ recipe: candidate }) =>
              candidate.module === module.type && (!selected || selected === candidate.id) &&
              inputList(candidate).filter((entry) => items.get(entry.item)?.kind !== 'fluid').length === 1 &&
              componentOf(candidate.inputs[0].item) === item);
            for (const { recipe: recovery } of recoveries) {
              const check = resolveModule(recovery, module, calibration, items, definitions);
              if (check) {
                failures.push(status(check.code, input.slot, check.message, { item, recipe: recovery.id }));
              } else if (outputs.some((port) => port.color === input.color && reaches(port.id, normal, nextPath))) return true;
            }
          }
        }
        return false;
      }
      const missing = [recipe.outputs[0], ...recipe.alternateOutputs].filter((entry) =>
        !reaches(step.outputPort, componentOf(entry.item), new Set()));
      if (missing.length) {
        for (const entry of missing) failures.push(status('random-output-route', step.slot,
          `随机产物 ${items.get(entry.item)?.name || entry.item} 无法走完整条生产路线，请检查分流及返工。`,
          { item: entry.item, recipe: recipe.id, port:step.outputPort }));
      } else {
        plan.issues.push(warning('random-output', step.slot, '成品和随机出现的未整理产物均可通过设计路线；加工时间取决于实际返工数量。', { recipe: recipe.id }));
      }
    }
    return failures;
  }

  const finals = (graph.entries.get(-1) || []).filter((port) => port.kind === 'final' && accepts(port, wanted, componentOf));
  if (!finals.length) return { plan: null, issues: [status('missing-final', -1, '请设置控制室的成品接收端口。', { item: circuit.item })] };
  const plan = supplyThrough(finals, wanted, circuit.quantity, blankPlan(), new Set());
  if (!plan?.steps.length) {
    const relevant = [...failed.values()].sort((left, right) =>
      Number(left.issue.code === 'missing-ingredient') - Number(right.issue.code === 'missing-ingredient') || left.depth - right.depth);
    return { plan, issues: [...relevant.slice(0, 9).map(({ issue }) => issue),
      status('no-production-path', -1, '所选电路没有可用的生产路径通往控制室。', { item: circuit.item })] };
  }
  const delivery = plan.flows.at(-1);
  const surplus = plan.supply.get(inventoryKey(delivery.from, wanted, undefined)) || 0;
  return { plan, surplus, issues: [...checkRandomBranches(plan), ...plan.issues] };
}

function powerModel(project, dataset, plan, calibration, power) {
  const steps = [];
  const recipes = new Map(dataset.recipes.map((recipe) => [recipe.id, recipe]));
  const grouped = new Map();
  for (const step of plan.steps) {
    const key = `${step.slot}/${step.recipe}`;
    const previous = grouped.get(key);
    grouped.set(key, { ...step, batches: (previous?.batches || 0) + step.batches });
  }
  const matrixCount = project.modules.filter((module) => module?.type === 'assembly').length;
  const otherCount = project.modules.filter((module) => module && !['assembly', 'splitter'].includes(module.type)).length;
  for (const step of grouped.values()) {
    const recipe = recipes.get(step.recipe);
    const module = project.modules[step.slot];
    const stats = modifier(recipe, module, calibration);
    const level = module.type === 'assembly' ? tierIndex(recipe.casingTier ?? 1)
      : voltages.findIndex((voltage) => voltage >= recipe.eu);
    steps.push({ ...step, ...stats, level: level < 0 ? 14 : level, matrix: module.type === 'assembly' });
  }
  function simulateRatio(ratio) {
    const matrixPower = Math.trunc(Math.fround(Math.fround(ratio / 100) * Math.fround(power.total)));
    const otherPower = power.total - matrixPower;
    const matrixEach = Math.floor(matrixPower / Math.max(1, matrixCount));
    const otherEach = Math.floor(otherPower / Math.max(1, otherCount));
    const allocations = project.modules.flatMap((module, slot) => !module ? []
      : [{ slot, eu: module.type === 'splitter' ? 0 : module.type === 'assembly' ? matrixEach : otherEach }]);
    const ticksPerSlot = new Map();
    const blocked = [];
    for (const step of steps) {
      const budget = step.matrix ? matrixEach : otherEach;
      let { eu, ticks } = step;
      if (Math.floor(eu) > budget || budget <= 0) {
        blocked.push({ ...step, required: Math.floor(eu), budget });
        continue;
      }
      for (let left = power.tier - step.level; left > 0 && ticks / 2 >= 100 && eu * 2 <= budget; left--) {
        ticks /= 2;
        eu *= 2;
      }
      eu = Math.max(1, Math.floor(eu));
      ticks = Math.max(1, Math.floor(ticks));
      const parallel = Math.min(2147483647, Math.max(1, Math.floor(budget / eu)));
      function batchTime(batch) {
        let elapsed = ticks;
        let load = eu * batch;
        while (Math.floor(elapsed / 2) >= 100 && load * 4 <= budget) {
          elapsed = Math.floor(elapsed / 2);
          load *= 4;
        }
        return elapsed;
      }
      const full = Math.floor(step.batches / parallel);
      const tail = step.batches % parallel;
      const spent = full * batchTime(parallel) + (tail ? batchTime(tail) : 0);
      ticksPerSlot.set(step.slot, (ticksPerSlot.get(step.slot) || 0) + spent);
    }
    return { ratio, ticks: blocked.length ? null : Math.max(0, ...ticksPerSlot.values()),
      sequentialTicks: blocked.length ? null : [...ticksPerSlot.values()].reduce((sum, ticks) => sum + ticks, 0),
      allocations, blocked };
  }
  const applied = simulateRatio(power.ratio);
  const choices = Array.from({ length: 99 }, (_, index) => simulateRatio(index + 1))
    .filter((candidate) => candidate.ticks != null)
    .sort((left, right) => left.ticks - right.ticks || left.sequentialTicks - right.sequentialTicks ||
      Math.abs(left.ratio - power.ratio) - Math.abs(right.ratio - power.ratio));
  const best = choices[0];
  const issues = applied.blocked.map((step) => status('module-power', step.slot,
    `当前比例只分得 ${step.budget.toLocaleString('zh-CN')} EU/t，这条配方至少需要 ${step.required.toLocaleString('zh-CN')} EU/t。`,
    { recipe: step.recipe }));
  if (!best) issues.push(status('power-insufficient', -1, '当前输入功率下，没有可以驱动所有所需模块的供电比例。'));
  return { recommendation: best ? { ratio: best.ratio, otherRatio: 100 - best.ratio, ticks: best.ticks,
    sequentialTicks: best.sequentialTicks, appliedRatio: power.ratio, appliedTicks: applied.ticks,
    power: power.total, allocations: best.allocations, appliedAllocations: applied.allocations } : null, issues };
}

export function analyzeCircuit(project, dataset, circuit) {
  const items = new Map(dataset.items.map((item) => [item.id, item]));
  const graph = makeGraph(project);
  const power = readPower(project.power);
  const target = items.get(circuit?.item);
  const outputId = target?.component || target?.id;
  const targetRecipe = dataset.recipes.find((recipe) => recipe.module !== 'conversion' &&
    recipe.outputs?.some((output) => output.item === outputId));
  const result = {
    ok: false, issues: [...graph.issues, ...power.issues], materials: [], unitMaterials: [], omitted: [], steps: [],
    recommendation: null, recipe: targetRecipe?.id ?? null,
    circuit: { item: circuit?.item ?? null, quantity: Number(circuit?.quantity || 0), produced: 0 },
  };
  if (!target || !targetRecipe) {
    result.issues.push(status('circuit-selection', null, '请选择具有 NAC 配方的电路。'));
    return result;
  }
  if (!positive(circuit.quantity)) {
    result.issues.push(status('circuit-quantity', null, '请输入大于 0 的整数成品数量。', { item: target.id }));
    return result;
  }
  const { family, level } = calibrationSelection(project.power?.calibration, target, dataset);
  const calibration = { family, level: Math.max(0, Math.min(level, 3)) };
  result.calibration = { ...calibration, name: names[calibration.family] || '无校准' };
  const routing = routePlanner(project, dataset, graph, items, calibration, result.circuit);
  result.issues.push(...routing.issues);
  if (!routing.plan) return result;
  const plan = routing.plan;
  const activePorts = new Set(plan.flows.flatMap((flow) => [flow.from, flow.to]));
  result.issues = [
    ...graph.issues.map((issue) => issue.ports?.some((id) => activePorts.has(id)) ? issue : { ...issue, severity: 'warning' }),
    ...power.issues, ...routing.issues,
  ];
  result.circuit.produced = result.circuit.quantity + routing.surplus;
  const sortedMaterials = (materials) => [...materials.values()].sort((a, b) => a.kind.localeCompare(b.kind) ||
    (items.get(a.item)?.name || a.item).localeCompare(items.get(b.item)?.name || b.item, 'zh-CN') ||
    Number(a.renamed) - Number(b.renamed));
  result.materials = sortedMaterials(plan.materials);
  const unitPlan = result.circuit.quantity === 1 ? plan
    : routePlanner(project, dataset, graph, items, calibration, { ...result.circuit, quantity: 1 }).plan;
  result.unitMaterials = unitPlan ? sortedMaterials(unitPlan.materials) : [];
  result.omitted = plan.omitted.filter((entry, index, entries) => entry.amount != null ||
    entries.findIndex((other) => other.slot === entry.slot && other.item === entry.item && other.reason === entry.reason) === index);
  result.steps = plan.steps;
  result.recipe = plan.steps.find((step) => step.product === outputId &&
    project.modules[step.slot]?.type === targetRecipe.module)?.recipe ?? result.recipe;
  if (!power.issues.length) {
    const energy = powerModel(project, dataset, plan, calibration, power);
    result.recommendation = energy.recommendation;
    result.issues.push(...energy.issues);
  }
  result.ok = result.issues.every((issue) => issue.severity !== 'error');
  return result;
}
