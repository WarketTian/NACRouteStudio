import { isInput, isOutput, matchingPortDyes } from './port-connection.js';

function recipeIndex(dataset) {
  const items = new Map(dataset.items.map((item) => [item.id, item]));
  const canonical = (id) => items.get(id)?.component || id;
  const solid = (id) => typeof id === 'string' && items.get(id)?.kind !== 'fluid' && !id.startsWith('fluid:');
  const ingredients = (recipe) => [...(recipe.inputs || []), ...(recipe.fluids || [])]
    .filter((entry) => !entry.continuous && solid(entry.item));
  const products = (recipe) => [...(recipe.outputs || []), ...(recipe.alternateOutputs || [])]
    .filter((entry) => solid(entry.item));
  const markKey = (mark) => JSON.stringify([canonical(mark.item), Boolean(mark.renamed)]);
  const unique = (marks) => {
    const result = new Map();
    for (const mark of marks) {
      if (!solid(mark?.item)) continue;
      const key = markKey(mark);
      if (!result.has(key)) result.set(key, { item: mark.item, renamed: Boolean(mark.renamed) });
    }
    return [...result.values()];
  };
  return { canonical, ingredients, products, unique };
}

function recipeSelections(module) {
  const selections = module?.config?.recipeSelections;
  return selections && typeof selections === 'object' && !Array.isArray(selections) ? selections : {};
}

export function selectedRecipeFor(module, item) {
  const selections = recipeSelections(module);
  return Object.hasOwn(selections, item) && typeof selections[item] === 'string' ? selections[item] : null;
}

// A machine can run recipes for several products. Only alternatives for the same output replace one another.
export function setModuleRecipe(dataset, module, recipeId, enabled = true) {
  if (!module) return false;
  const entries = Object.entries(recipeSelections(module));
  if (!enabled) {
    const remaining = entries.filter(([, id]) => id !== recipeId);
    if (remaining.length === entries.length) return false;
    module.config.recipeSelections = Object.fromEntries(remaining);
    return true;
  }
  const recipe = dataset.recipes.find((entry) => entry.id === recipeId && entry.module === module.type);
  if (!recipe) return false;
  const { canonical, products } = recipeIndex(dataset);
  const outputs = products(recipe).map((entry) => canonical(entry.item));
  if (!outputs.length || outputs.every((item) => selectedRecipeFor(module, item) === recipeId)) return false;
  const previous = new Map(entries);
  for (const item of outputs) previous.set(item, recipeId);
  (module.config ||= {}).recipeSelections = Object.fromEntries(previous);
  return true;
}

export function splitterRuleMatches(rule, color, item, renamed, config, canonical) {
  if (rule.inputs?.length && !rule.inputs.includes(color)) return false;
  if (rule.items?.length && !rule.items.some((filter) =>
    canonical(filter.item) === item && Boolean(filter.renamed) === renamed)) return false;
  const channel = rule.redstone?.channel ?? 0;
  const level = Number(rule.redstone?.level ?? 0);
  return level <= Number(config?.redstone?.[channel] ?? 0);
}

// Project tags are hints. Match only annotated solids, propagated through correctly dyed links.
// Selected recipe outputs are proposed separately, so they do not populate unrelated input ports.
function createMarkIndex(project, index) {
  const ports = new Map(project.ports.map((port) => [port.id, port]));
  const inbound = new Map();
  const inputBySlot = new Map();
  const known = new Map();
  for (const port of ports.values()) {
    known.set(port.id, index.unique(port.items || []));
    if (port.kind === 'in') {
      if (!inputBySlot.has(port.slot)) inputBySlot.set(port.slot, []);
      inputBySlot.get(port.slot).push(port);
    }
  }
  for (const route of project.routes) {
    const from = ports.get(route.from);
    const to = ports.get(route.to);
    if (!isOutput(from) || !isInput(to) || !matchingPortDyes(from, to, route.color)) continue;
    if (!inbound.has(to.id)) inbound.set(to.id, new Set());
    inbound.get(to.id).add(from.id);
  }
  const upstream = (port) => index.unique([...(inbound.get(port.id) || [])].flatMap((id) => known.get(id)));
  const observed = (port) => {
    const marked = known.get(port.id);
    return marked.length ? marked : upstream(port);
  };
  const inputs = (slot) => inputBySlot.get(slot) || [];
  const splitterOutputs = [...ports.values()].filter((port) =>
    port.kind === 'out' && project.modules[port.slot]?.type === 'splitter');
  const routeMarks = (port, includeRuleItems) => {
    const module = project.modules[port.slot];
    const result = [];
    for (const rule of module.rules || []) {
      if (!rule.outputs?.includes(port.color)) continue;
      const eligible = inputs(port.slot).filter((source) => !rule.inputs?.length || rule.inputs.includes(source.color));
      for (const source of eligible) {
        const received = observed(source);
        const candidates = !received.length && includeRuleItems ? index.unique(rule.items || []) : received;
        for (const mark of candidates) {
          if (splitterRuleMatches(rule, source.color, index.canonical(mark.item), mark.renamed,
            module.config, index.canonical)) result.push(mark);
        }
      }
      if (!eligible.length && includeRuleItems) {
        const color = rule.inputs?.[0] ?? port.color;
        for (const mark of index.unique(rule.items || [])) {
          if (splitterRuleMatches(rule, color, index.canonical(mark.item), mark.renamed, module.config, index.canonical)) result.push(mark);
        }
      }
    }
    return index.unique(result);
  };
  // Only monotonically add actual annotations. Chained splitters may feed back into earlier modules.
  let changed;
  do {
    changed = false;
    for (const port of splitterOutputs) {
      if (port.items?.length) continue;
      const previous = known.get(port.id);
      const next = index.unique([...previous, ...routeMarks(port, false)]);
      if (next.length === previous.length) continue;
      known.set(port.id, next);
      changed = true;
    }
  } while (changed);
  return { ports, upstream, observed, inputs, routeMarks };
}

export function listModuleRecipes(project, dataset, slot) {
  const module = project.modules[slot];
  if (!module) return [];
  const index = recipeIndex(dataset);
  const marks = createMarkIndex(project, index);
  const incoming = new Set(marks.inputs(slot).flatMap(marks.observed).map((entry) => index.canonical(entry.item)));
  return dataset.recipes.filter((recipe) => recipe.module === module.type).flatMap((recipe) => {
    const ingredients = index.ingredients(recipe);
    const matchedItems = ingredients.flatMap((ingredient) => {
      const match = [ingredient, ...(ingredient.alternatives || [])].find((entry) => incoming.has(index.canonical(entry.item)));
      return match ? [match.item] : [];
    });
    const selected = index.products(recipe).some((entry) =>
      selectedRecipeFor(module, index.canonical(entry.item)) === recipe.id);
    return selected || matchedItems.length ? [{ recipe, matched: matchedItems.length, required: ingredients.length, selected, matchedItems }] : [];
  }).sort((a, b) => Number(b.selected) - Number(a.selected) ||
    b.matched / Math.max(1, b.required) - a.matched / Math.max(1, a.required));
}

export function portItemSuggestions(project, dataset, portId) {
  const index = recipeIndex(dataset);
  const marks = createMarkIndex(project, index);
  const port = marks.ports.get(portId);
  if (!port) return [];
  if (isInput(port)) return marks.upstream(port);
  if (port.kind !== 'out') return [];
  const module = project.modules[port.slot];
  if (!module) return [];
  if (module.type === 'splitter') return marks.routeMarks(port, true);
  const selected = new Set(Object.values(recipeSelections(module)));
  return index.unique(dataset.recipes.filter((recipe) => recipe.module === module.type && selected.has(recipe.id))
    .flatMap((recipe) => {
      const first = index.ingredients(recipe)[0];
      const source = new Set([first, ...(first?.alternatives || [])].filter(Boolean).map((entry) => index.canonical(entry.item)));
      const sourceColors = marks.inputs(port.slot).filter((input) => marks.observed(input)
        .some((entry) => source.has(index.canonical(entry.item)))).map((input) => input.color);
      if (sourceColors.length && !sourceColors.includes(port.color)) return [];
      return index.products(recipe).filter((entry) => selectedRecipeFor(module, index.canonical(entry.item)) === recipe.id);
    }));
}

export function splitterRuleSuggestions(project, dataset, slot, ruleIndex) {
  const module = project.modules[slot];
  const rule = module?.rules?.[ruleIndex];
  if (module?.type !== 'splitter' || !rule) return [];
  const index = recipeIndex(dataset);
  const marks = createMarkIndex(project, index);
  return index.unique(marks.inputs(slot).filter((input) => !rule.inputs?.length || rule.inputs.includes(input.color))
    .flatMap(marks.observed));
}
