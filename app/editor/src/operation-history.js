export const HISTORY_LIMIT = 100;
export const HISTORY_BYTES = 24 * 1024 * 1024;

const encoder = new TextEncoder();
const unsafeKeys = new Set(['__proto__','constructor','prototype']);
const object = value => value !== null && typeof value === 'object';
const validKey = key => (typeof key==='string'&&!unsafeKeys.has(key)) || (Number.isInteger(key)&&key>=0);
const own = (value,key) => Object.hasOwn(value,key) ? value[key] : undefined;

function equal(a,b) {
  if (Object.is(a,b)) return true;
  if (!object(a)||!object(b)||Array.isArray(a)!==Array.isArray(b)) return false;
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length && keys.every(key=>Object.hasOwn(b,key)&&equal(a[key],b[key]));
}

function difference(before,after,path,changes) {
  if (Object.is(before,after)) return;
  if (Array.isArray(before)&&Array.isArray(after)) {
    if (before.length===after.length) {
      before.forEach((value,index)=>difference(value,after[index],[...path,index],changes));
    } else {
      let first=0, last=0;
      const common=Math.min(before.length,after.length);
      while (first<common&&equal(before[first],after[first])) first++;
      while (last<common-first&&equal(before.at(-last-1),after.at(-last-1))) last++;
      changes.push({path,index:first,before:before.slice(first,before.length-last),after:after.slice(first,after.length-last)});
    }
  } else if (object(before)&&object(after)&&!Array.isArray(before)&&!Array.isArray(after)) {
    const keys=new Set([...Object.keys(before),...Object.keys(after)]);
    // Keep imported custom objects containing prototype-like keys as a single value.
    if ([...keys].some(key=>!validKey(key))) {
      if (!equal(before,after)) changes.push({path,before,after});
      return;
    }
    for (const key of keys) {
      difference(own(before,key),own(after,key),[...path,key],changes);
    }
  } else changes.push({path,...(before!==undefined&&{before}),...(after!==undefined&&{after})});
}

function apply(snapshot,changes,forward) {
  const nextKey=forward?'after':'before', previousKey=forward?'before':'after';
  for (const change of changes) {
    const {path,index}=change;
    if (!path.length) { snapshot=structuredClone(change[nextKey]); continue; }
    let parent=snapshot;
    for (const key of path.slice(0,-1)) parent=own(parent,key);
    const key=path.at(-1);
    if (index!=null) {
      const current=parent[key];
      parent[key]=current.slice(0,index).concat(structuredClone(change[nextKey]),current.slice(index+change[previousKey].length));
    } else if (Object.hasOwn(change,nextKey)) parent[key]=structuredClone(change[nextKey]);
    else delete parent[key];
  }
  return snapshot;
}

export function normalizeOperationHistory(saved) {
  if (saved?.schema!==1||!Array.isArray(saved.entries)||saved.entries.length>HISTORY_LIMIT||
      !Number.isInteger(saved.cursor)||saved.cursor<0||saved.cursor>saved.entries.length) return null;
  for (const entry of saved.entries) {
    if (typeof entry?.label!=='string'||!entry.label||entry.label.length>100||!Number.isFinite(entry.time)||Math.abs(entry.time)>8.64e15||
        !Array.isArray(entry.changes)||!entry.changes.length) return null;
    for (const change of entry.changes) {
      if (!Array.isArray(change?.path)||!change.path.every(validKey)||
          (!Object.hasOwn(change,'before')&&!Object.hasOwn(change,'after'))) return null;
      if (Object.hasOwn(change,'index')&&(!Number.isInteger(change.index)||change.index<0||
          !change.path.length||!Array.isArray(change.before)||!Array.isArray(change.after))) return null;
      if (!change.path.length&&(!object(change.before)||!object(change.after))) return null;
    }
  }
  return {schema:1,cursor:saved.cursor,entries:saved.entries,trimmed:saved.trimmed===true};
}

const entryBytes = entry => encoder.encode(JSON.stringify(entry)).byteLength+1;
const fallbackLabels = { name:'修改工程名称', notes:'修改工程备注', modules:'修改结构', ports:'修改端口',
  routes:'修改线路', circuits:'修改目标电路', power:'修改供电设置' };

// Old patches address old bend coordinates and array indices. Replay them against
// the old snapshot first, then generate equivalent changes between migrated states.
export function migrateOperationHistory(project,saved,transform) {
  const source=normalizeOperationHistory(saved);
  if (!source) return null;
  try {
    let old=structuredClone(project);
    for (let step=source.cursor-1;step>=0;step--) old=apply(old,source.entries[step].changes,false);
    let current=transform(old);
    const entries=[];
    let cursor=0, bytes=0;
    for (const [index,entry] of source.entries.entries()) {
      old=apply(old,entry.changes,true);
      const next=transform(old);
      if (next.id!==current.id||next.schema!==current.schema) return null;
      const changes=[];
      difference(current,next,[],changes);
      if (changes.length) {
        const migrated={...entry,changes};
        bytes+=entryBytes(migrated);
        entries.push(migrated);
        if (index<source.cursor) cursor++;
      }
      current=next;
    }
    let trimmed=source.trimmed;
    while (bytes>HISTORY_BYTES&&entries.length>1) {
      if (cursor>0) { bytes-=entryBytes(entries.shift()); cursor--; }
      else bytes-=entryBytes(entries.pop());
      trimmed=true;
    }
    return {schema:1,cursor,entries,trimmed};
  } catch { return null; }
}

export function createOperationHistory(project,saved) {
  const initial=normalizeOperationHistory(saved);
  let snapshot=structuredClone(project);
  let entries=initial?structuredClone(initial.entries):[];
  let sizes=entries.map(entryBytes);
  let bytes=sizes.reduce((total,size)=>total+size,0);
  let cursor=initial?.cursor??0;
  let trimmed=initial?.trimmed??false;
  return {
    get cursor() { return cursor; },
    get entries() { return entries; },
    get trimmed() { return trimmed; },
    record(next,label) {
      const copy=structuredClone(next);
      const changes=[];
      difference(snapshot,copy,[],changes);
      if (!changes.length) return false;
      for (const size of sizes.slice(cursor)) bytes-=size;
      entries=entries.slice(0,cursor);
      sizes=sizes.slice(0,cursor);
      const entry={label:(label||fallbackLabels[changes[0].path[0]]||'修改工程').slice(0,100),time:Date.now(),changes};
      const size=entryBytes(entry);
      entries.push(entry); sizes.push(size); bytes+=size;
      while (entries.length>HISTORY_LIMIT||bytes>HISTORY_BYTES&&entries.length>1) {
        entries.shift(); bytes-=sizes.shift(); trimmed=true;
      }
      cursor=entries.length;
      snapshot=copy;
      return true;
    },
    seek(index) {
      if (!Number.isInteger(index)||index<0||index>entries.length||index===cursor) return null;
      let next=structuredClone(snapshot);
      try {
        if (index>cursor) for (let step=cursor;step<index;step++) next=apply(next,entries[step].changes,true);
        else for (let step=cursor;step>index;step--) next=apply(next,entries[step-1].changes,false);
        if (next?.id!==project.id||next?.schema!==project.schema) return null;
      } catch { return null; }
      cursor=index; snapshot=next;
      return structuredClone(next);
    },
    serialize() { return {schema:1,cursor,entries,trimmed}; },
  };
}
