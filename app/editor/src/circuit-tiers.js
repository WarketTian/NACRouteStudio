import { voltageTiers } from './project.js';
import { compileSearch, itemSearchFields } from './search.js';

// GT5-Unofficial 5.09.54.265: MetaGeneratedItem03 registers the circuit tier
// and IDMetaItem03 supplies the metadata, offset by 32000 in the game registry.
// List the NAC IDs first, then the registered physical-item metadata by tier.
const tierRows = [
  ['ULV', ['NandChip'], [75]],
  ['LV', ['Microprocessor'], [78, 305]],
  ['MV', ['IntegratedProcessor'], [79, 80]],
  ['HV', ['NanoProcessor'], [82, 306]],
  ['EV', ['QuantumProcessor'], [83, 85]],
  ['IV', ['CrystalProcessor'], [84, 86, 89]],
  ['LuV', ['CrystalAssembly', 'WetwareProcessor'], [87, 92, 96]],
  ['ZPM', ['CrystalComputer', 'WetwareAssembly', 'BiowareProcessor'], [88, 90, 93, 97]],
  ['UV', ['CrystalMainframe', 'WetwareComputer', 'BiowareAssembly', 'OpticalProcessor'], [91, 94, 98, 154]],
  ['UHV', ['WetwareMainframe', 'BiowareComputer', 'OpticalAssembly'], [95, 99, 155, 166]],
  ['UEV', ['BiowareMainframe', 'OpticalComputer'], [120, 156, 167, 170]],
  ['UIV', ['OpticalMainframe'], [157, 168, 171, 174]],
  ['UMV', ['PicoCircuit'], [169, 172, 175]],
  ['UXV', ['QuantumCircuit'], [173, 176]],
  ['MAX', ['PlanckCircuit'], [177]],
];

const tierById = new Map();
const tierByMeta = new Map();
for (const [tier, ids, metas] of tierRows) {
  for (const id of ids) tierById.set(id, tier);
  for (const meta of metas) tierByMeta.set(32000 + meta, tier);
}

// NewHorizonsCoreMod 2.9.99: GT_Loader_OreDictionary registers these three
// physical circuits. The in-game registry spells PicoCircuit as PikoCircuit.
const coreTierByRegistry = new Map([
  ['dreamcraft:pikocircuit', 'UMV'],
  ['dreamcraft:quantumcircuit', 'UXV'],
  ['dreamcraft:planckcircuit', 'MAX'],
]);
const tierRanks = new Map(voltageTiers.map((tier,index) => [tier,index]));
const tierByQuery = new Map(voltageTiers.map(tier => [tier.toLowerCase(),tier]));

function byId(id) {
  return typeof id === 'string' ? tierById.get(id.replace(/^item:/, '')) : undefined;
}

export function circuitTier(item) {
  if (typeof item === 'string') return byId(item) ?? null;
  if (!item || typeof item !== 'object') return null;

  const knownTier = byId(item.id) ?? byId(item.component);
  if (knownTier) return knownTier;

  const registry = typeof item.gameRegistry === 'string' ? item.gameRegistry.toLowerCase() : '';
  if (registry === 'gregtech:gt.metaitem.03') {
    const physicalTier = tierByMeta.get(Number(item.gameMeta));
    if (physicalTier) return physicalTier;
  }
  if (Number(item.gameMeta ?? 0) === 0 && coreTierByRegistry.has(registry)) {
    return coreTierByRegistry.get(registry);
  }

  return typeof item.circuitTier === 'string'
    ? voltageTiers.find(tier => tier.toUpperCase() === item.circuitTier.trim().toUpperCase()) ?? null
    : null;
}

export function targetCircuitRows(circuits,items,query='',tierFilter='') {
  const matches=compileSearch(query,{tiers:tierByQuery});
  return circuits.map(id=>({id,tier:circuitTier(items.get(id)||id)})).filter(({id,tier})=>{
    if (tierFilter&&tier!==tierFilter) return false;
    const item=itemSearchFields(items.get(id)||{id});
    return matches({...item,names:[...item.names,tier?.toLowerCase()||'']},tier);
  }).sort((left,right)=>(tierRanks.get(left.tier)??tierRanks.size)-(tierRanks.get(right.tier)??tierRanks.size));
}
