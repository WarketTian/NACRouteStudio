import { analyzeCircuit } from './engine.js';

function mergeAmounts(stacks) {
  const totals = new Map();
  for (const stack of stacks) {
    const key = JSON.stringify([stack.item, Boolean(stack.renamed)]);
    const prior = totals.get(key);
    totals.set(key, { ...stack, amount: (prior?.amount || 0) + stack.amount });
  }
  return [...totals.values()];
}

export function generateFinalRecipes(project, dataset) {
  const entries = project.circuits.map((circuit, index) => {
    const target = { ...circuit };
    const report = analyzeCircuit(project, dataset, target);
    const recipe = report.circuit.produced > 0 ? {
      id: `generated:${index}:${target.item}`,
      module: 'generated',
      inputs: report.materials.map((stack) => ({ ...stack })),
      outputs: [{ item: target.item, amount: report.circuit.produced }],
    } : null;
    return { target, report, recipe };
  });

  // Independent target batches are reproducible even if the player runs them separately.
  const combined = entries.length && entries.every(({ report }) => report.ok) ? {
    id: 'generated:all',
    module: 'generated',
    inputs: mergeAmounts(entries.flatMap(({ recipe }) => recipe.inputs)),
    outputs: mergeAmounts(entries.flatMap(({ recipe }) => recipe.outputs)),
  } : null;
  return { entries, combined };
}

export function findItemRecipes(dataset, item, direction = 'craft') {
  if (typeof item !== 'string' || (direction !== 'craft' && direction !== 'usage')) return [];
  const aliases = new Map(dataset.items.filter((entry) => entry.component).map((entry) => [entry.id, entry.component]));
  const canonical = (id) => aliases.get(id) ?? id;
  const component = canonical(item);
  const exact = [];
  const related = [];
  for (const recipe of dataset.recipes) {
    const entries = direction === 'craft'
      ? [...(recipe.outputs || []), ...(recipe.fluidOutputs || []), ...(recipe.alternateOutputs || [])]
      : [...(recipe.inputs || []), ...(recipe.fluids || [])].flatMap((entry) => [entry, ...(entry.alternatives || [])]);
    if (entries.some((entry) => entry.item === item)) exact.push(recipe);
    // Packing and unpacking are directional. Alias matching there would reverse the lookup.
    else if (recipe.module !== 'conversion' && entries.some((entry) => canonical(entry.item) === component)) related.push(recipe);
  }
  return [...exact, ...related];
}
