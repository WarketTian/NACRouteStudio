export const shortcutDefaults = Object.freeze({ book:'B', target:'T', items:'I' });
export const shortcutLabels = { book:'打开合成表', target:'选择目标配方', items:'打开物品目录' };
const reserved = new Set(['V','R','H','F','S']);
const themes = new Set(['system','light','dark']);

export function readPreferences(storage) {
  let stored;
  try { stored = JSON.parse(storage.getItem('nac.preferences')); } catch { stored = null; }
  const candidate=Object.fromEntries(Object.entries(shortcutDefaults).map(([id,key])=>[id,stored?.shortcuts?.[id]??key]));
  const keys=Object.values(candidate);
  const shortcuts=new Set(keys).size===keys.length && keys.every(key=>typeof key==='string'&&/^[A-Z]$/.test(key)&&!reserved.has(key))
    ? candidate : { ...shortcutDefaults };
  return { theme:themes.has(stored?.theme) ? stored.theme : 'dark', shortcuts };
}

export function validateShortcut(shortcuts, id, input) {
  const key=String(input).trim().toUpperCase();
  if (!/^[A-Z]$/.test(key)) throw Error('快捷键需使用一个英文字母。');
  if (reserved.has(key) || Object.entries(shortcuts).some(([other,value])=>other!==id&&value===key)) {
    throw Error(`${key} 已被其他操作使用。`);
  }
  return key;
}
