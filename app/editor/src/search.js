import { pronunciations } from './data/pinyin-data.js';

// Match the default full-pinyin input of GTNH's Not Enough Characters (PinIn).
// Prefix, full syllable and tone are alternatives for each character; only the
// last syllable may be incomplete. Keep all readings of polyphonic characters.
const readings = new Map();
const extraReadings = {
  '𬬻':'lu2 jinlu', '𬭊':'du4 jindu', '𬭳':'xi3 jinxi', '𬭛':'bo1 jinbo',
  '𬭶':'hei1 jinhei', '鿏':'mai4 jinmai', '𫟼':'da2 jinda', '𬬭':'lun2 jinlun',
  '鿔':'ge1 jinge', '鿭':'ni3 jiner', '𫓧':'fu1 jinfu', '𫟷':'li4 jinli',
  '鿬':'tian2 shitian', '鿫':'ao4 qiao aoqi',
};
const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase();

function choices(character) {
  const known = readings.get(character);
  if (known) return known;
  const data = pronunciations[character];
  const extra = extraReadings[character];
  if (!data && !extra) return [character];
  const result = new Set([character]);
  for (const syllable of [data,extra].filter(Boolean).join(' ').split(' ')) {
    const untuned = syllable.replace(/\d$/, '');
    result.add(untuned[0]);
    const onset = /^(zh|ch|sh)/.exec(untuned)?.[0];
    if (onset) result.add(onset);
    result.add(untuned);
    result.add(syllable);
  }
  const options = [...result];
  readings.set(character,options);
  return options;
}

function containsPinyin(text,query) {
  if (text.includes(query)) return true;
  if (!/[a-z]/.test(query) || !/\p{Script=Han}/u.test(text)) return false;

  // Each offset records how much of the query matched at the previous character.
  let offsets = new Set();
  for (const character of text) {
    const options = choices(character);
    const next = new Set();
    offsets.add(0);
    for (const offset of offsets) {
      const remaining = query.slice(offset);
      for (const option of options) {
        if (option.startsWith(remaining)) return true;
        if (remaining.startsWith(option)) next.add(offset + option.length);
      }
    }
    offsets = next;
  }
  return false;
}

const fieldsByItem = new WeakMap();
const fields = (...values) => values.flat().filter(value=>typeof value==='string' && value).map(normalize);
const prefixField = { '@':'mods', '&':'ids', '$':'ores', '#':'tooltips' };

export function itemSearchFields(item) {
  const cached = fieldsByItem.get(item);
  if (cached) return cached;
  const registry = item.gameRegistry || item.registry || '';
  const namespace = /^(\w+):/.exec(registry)?.[1] || (/^gt\./.test(item.localeKey || '') ? 'gregtech' : '');
  const registryMeta = registry && item.gameMeta != null ? `${registry}:${item.gameMeta}` : '';
  const ids = fields(item.id,registry,registryMeta);
  const mods = fields(item.mod,item.modName,item.modId,namespace,namespace.toLowerCase()==='dreamcraft'?'New Horizons Core Mod':'');
  const ore = /^GTOreDictUnificator\.get\(OrePrefixes\.(\w+), Materials\.(\w+),/.exec(item.gameSource || '');
  const ores = fields(item.oreNames,item.oreDictionary,item.oreDict,ore&&`${ore[1]}${ore[2]}`);
  const names = fields(item.name,item.en,item.originalName,item.aliases,ids);
  const result = { names,ids,mods,ores,tooltips:fields(item.tooltip,item.tooltips) };
  fieldsByItem.set(item,result);
  return result;
}

export function compileSearch(query,{ tiers=null }={}) {
  const groups = [[]];
  const tokens = normalize(query).match(/-?[@&$#]?"(?:\\.|[^"\\])*"?|\||(?:\\.|[^\s|"\\])+/g) || [];
  for (const token of tokens) {
    if (token==='|') { groups.push([]); continue; }
    const negative = token.startsWith('-') && token.length>1;
    let term = negative ? token.slice(1) : token;
    const field = prefixField[term[0]];
    if (field && term.length>1) term = term.slice(1);
    const quoted = term.startsWith('"');
    if (quoted) term = term.slice(1).replace(/"$/, '');
    term = term.replace(/\\(.)/g, '$1');
    if (!term) continue;
    groups.at(-1).push({term,negative,field:field||'names',tier:!field&&!quoted?tiers?.get(term):null});
  }
  const active = groups.filter(group=>group.length);
  if (!active.length) return () => true;
  return (records,tier=null) => {
    const list = Array.isArray(records) ? records : [records];
    return active.some(group=>group.every(({term,negative,field,tier:exact})=>{
      const matches = exact ? exact===tier : list.some(record=>record[field]?.some(value=>containsPinyin(value,term)));
      return negative ? !matches : matches;
    }));
  };
}
