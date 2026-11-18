import { CELL_SIZE, GRID_SIZE, LAYER_STYLES, ROUTE_CLEARANCE, buildRoutes, findArrangementPath, getPlatform, getPortPosition, pointsToPath, routeSegments, snapGridCoordinate } from './diagram.js';
import { normalizeArrangeWeights } from './arrange-weights.js';
import { isPortCell } from './port-layout.js';
export { DEFAULT_ARRANGE_WEIGHTS, normalizeArrangeWeights } from './arrange-weights.js';

const round = number => Math.round(number * 10) / 10;
const layers = LAYER_STYLES.map((_, layer) => layer);

const platforms = Array.from({ length: 13 }, (_, index) => getPlatform(index - 1));

const lower = segment => Math.min(segment.start, segment.end);
const upper = segment => Math.max(segment.start, segment.end);
const span = (a, b) => Math.max(0, Math.min(upper(a), upper(b)) - Math.max(lower(a), lower(b)));
const within = (value, segment) => value >= lower(segment) && value <= upper(segment);
function tipPort(route,x,y) {
  if (route.tips[0].x===x && route.tips[0].y===y) return route.from?.id;
  if (route.tips[1].x===x && route.tips[1].y===y) return route.to?.id;
}
const crossingCell = ({x,y}) => `${snapGridCoordinate(x)},${snapGridCoordinate(y)}`;
const covered = ({x,y}, segments) => segments.some(segment => segment.horizontal
  ? y===segment.line && within(x,segment) : x===segment.line && within(y,segment));
const neighboringPorts = (a, b) => a && b && a.slot === b.slot && a.facing === b.facing
  && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
const adjacentFan = (first, second) => neighboringPorts(first.from, second.from) || neighboringPorts(first.to, second.to);

function stubAt(port, tip, next) {
  if (!port || !next) return null;
  const platform = getPlatform(port.slot);
  const horizontal = tip.y === next.y;
  const start = horizontal ? tip.x : tip.y;
  const end = horizontal ? next.x : next.y;
  const side = horizontal ? platform.x : platform.y;
  const edge = end > start ? side + platform.width + ROUTE_CLEARANCE : side - ROUTE_CLEARANCE;
  return { port: port.id, start, end: end > start ? Math.min(end, edge) : Math.max(end, edge) };
}

function sharedStubRanges(a, b) {
  const ranges = [];
  for (const x of a.stubs) for (const y of b.stubs) {
    if (x.port !== y.port) continue;
    const start = Math.max(lower(x), lower(y));
    const end = Math.min(upper(x), upper(y));
    if (end > start) ranges.push({ start, end });
  }
  return ranges.sort((a,b)=>a.start-b.start);
}

const pairCache=new WeakMap();

function interference(first, second) {
  if (first.route.id>second.route.id) [first,second]=[second,first];
  let cache=pairCache.get(first.segments);
  if (!cache) pairCache.set(first.segments,cache=new WeakMap());
  if (cache.has(second.segments)) return cache.get(second.segments);
  const junctions=new Map();
  const overlaps=[];
  let sharedStub = 0;
  for (const a of first.segments) {
    for (const b of second.segments) {
      if (a.horizontal !== b.horizontal) {
        if (!within(a.line, b) || !within(b.line, a)) continue;
        const x = a.horizontal ? b.line : a.line;
        const y = a.horizontal ? a.line : b.line;
        const tip=tipPort(first,x,y);
        if (tip==null || tip!==tipPort(second,x,y)) junctions.set(`${x},${y}`,{x,y});
      } else if (a.line===b.line) {
        let start=Math.max(lower(a),lower(b));
        const end=Math.min(upper(a),upper(b));
        if (end<=start) continue;
        for (const shared of sharedStubRanges(a,b)) {
          if (shared.end<=start) continue;
          if (shared.start>start) overlaps.push({horizontal:a.horizontal,line:a.line,start,end:shared.start});
          sharedStub+=shared.end-Math.max(start,shared.start);
          start=shared.end;
        }
        if (end>start) overlaps.push({horizontal:a.horizontal,line:a.line,start,end});
      }
    }
  }
  const result={ hits:[...junctions.values()], overlaps, overlap:overlaps.reduce((sum,{start,end})=>sum+end-start,0), sharedStub };
  cache.set(second.segments,result);
  return result;
}

const emptyConflicts = () => layers.map(()=>({hits:[],overlaps:[],overlap:0}));
function addConflicts(target,joint) {
  target.hits.push(...joint.hits);
  target.overlaps.push(...joint.overlaps);
  target.overlap+=joint.overlap;
}
const crossingCells = (hits,overlaps) => new Set(hits.filter(point=>!covered(point,overlaps)).map(crossingCell));

function layerConflicts(lines) {
  const result=emptyConflicts();
  lines.forEach((line,index)=>{
    for (let other=0;other<index;other++) {
      const peer=lines[other];
      if (line.layer===peer.layer) addConflicts(result[line.layer],interference(line,peer));
    }
  });
  for (const state of result) state.cells=crossingCells(state.hits,state.overlaps);
  return result;
}

function intrusionCount(segments, from, to, solidSlots) {
  let intrusions = 0;
  for (const segment of segments) {
    for (const slot of solidSlots) {
      if (slot===from.slot || slot===to?.slot) continue;
      const platform = platforms[slot+1];
      const side = segment.horizontal ? platform.y : platform.x;
      const start = segment.horizontal ? platform.x : platform.y;
      if (segment.line > side && segment.line < side + platform.width &&
          upper(segment) > start && lower(segment) < start + platform.width) intrusions++;
    }
  }
  return intrusions;
}

function geometry(route, points, ports, solidSlots, segments = routeSegments(points)) {
  const from = ports.get(route.from);
  const to = ports.get(route.to);
  const start = stubAt(from, points[0], points[1]);
  const end = stubAt(to, points.at(-1), points.at(-2));
  return {
    route, points, tips: [points[0], points.at(-1)],
    segments: segments.map((segment, index) => ({
      ...segment, stubs: [index === 0 && start, index === segments.length - 1 && end].filter(Boolean),
    })),
    from, to,
    layer: route.layer ?? 0,
    bends: Math.max(0, points.length - 2),
    length: segments.reduce((sum, segment) => sum + upper(segment) - lower(segment), 0),
    intrusions: intrusionCount(segments,from,to,solidSlots),
  };
}

function measure(lines, projected=false) {
  const metrics = { crossings: 0, sameLayerCrossings: 0, crossLayerCrossings: 0, bends: 0,
    length: 0, layers: new Set(), routeCount:lines.length, belowGround: 0, overlap: 0, sameLayerOverlap:0,
    sharedStub: 0, platformIntrusions: 0, adjacentCrossings: 0 };
  const conflicts=layerConflicts(lines);
  metrics.sameLayerOverlap=conflicts.reduce((sum,layer)=>sum+layer.overlap,0);
  metrics.sameLayerCrossings=conflicts.reduce((sum,layer)=>sum+layer.cells.size,0);
  metrics.crossings=metrics.sameLayerCrossings;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    metrics.bends += line.bends;
    metrics.length += line.length;
    metrics.layers.add(line.layer);
    metrics.platformIntrusions += line.intrusions;
    if (line.layer > 0) metrics.belowGround++;
    if (!projected) continue;
    for (let other = 0; other < index; other++) {
      const joint = interference(line, lines[other]);
      if (adjacentFan(line, lines[other])) metrics.adjacentCrossings += joint.hits.length;
      metrics.overlap += joint.overlap;
      metrics.sharedStub += joint.sharedStub;
      if (line.layer!==lines[other].layer) metrics.crossLayerCrossings+=joint.hits.length;
    }
  }
  metrics.crossings+=metrics.crossLayerCrossings;
  return { ...metrics, layers: metrics.layers.size };
}

const compareLength = (a, b) => Math.abs(a - b) <= 1e-7 ? 0 : a - b;
const sameLayerConflict = metrics => metrics.sameLayerOverlap / CELL_SIZE + metrics.sameLayerCrossings;
const score = (metrics,weights) =>
  sameLayerConflict(metrics) * weights.overlap + metrics.belowGround * weights.ground + metrics.bends * weights.bends;
const displayMetrics = (metrics,weights) => ({
  ...metrics, length:round(metrics.length), overlap:round(metrics.overlap), sharedStub:round(metrics.sharedStub),
  sameLayerConflict:sameLayerConflict(metrics), score:score(metrics,weights),
});
const gridCentered = line => line.points.every(({ x,y }) => x === snapGridCoordinate(x) && y === snapGridCoordinate(y));

function assess(line, others, existing=layerConflicts(others)) {
  const metrics = { platformIntrusions:line.intrusions, bends:line.bends, length:line.length };
  const byLayer=emptyConflicts();
  for (const other of others) {
    addConflicts(byLayer[other.layer],interference(line,other));
  }
  return layer => {
    const prior=existing[layer], next=byLayer[layer];
    const after=crossingCells([...prior.hits,...next.hits],[...prior.overlaps,...next.overlaps]).size;
    return { ...metrics, sameLayerOverlap:next.overlap, sameLayerCrossings:after-prior.cells.size, belowGround:Number(layer>0) };
  };
}

function compare(a, b, weights) {
  return a.platformIntrusions - b.platformIntrusions || compareLength(score(a,weights),score(b,weights))
    || compareLength(a.length,b.length);
}

function congestion(others,existing) {
  const occupied = [[], []];
  for (const other of others) for (const segment of other.segments) {
    occupied[Number(segment.horizontal)].push({ ...segment, layer:other.layer });
  }
  for (const segments of occupied) segments.sort((a, b) => a.line - b.line);
  function indexAt(segments, minimum) {
    let start = 0;
    let end = segments.length;
    while (start < end) {
      const middle = (start + end) >> 1;
      if (segments[middle].line < minimum) start = middle + 1;
      else end = middle;
    }
    return start;
  }
  return layer => (horizontal,line,start,end) => {
    const edge = { line, start, end };
    const costs = { overlap:0, crossings:0 };
    if (layer==null) return costs;
    const parallelHits=[];
    const parallel = occupied[Number(horizontal)];
    for (let index = indexAt(parallel,line); index < parallel.length && parallel[index].line===line; index++) {
      const segment=parallel[index];
      const length=segment.layer===layer ? span(edge,segment) : 0;
      if (!length) continue;
      costs.overlap+=length;
      parallelHits.push(segment);
    }
    const hits=new Map();
    const prior=existing[layer];
    const perpendicular = occupied[Number(!horizontal)];
    for (let index = indexAt(perpendicular, lower(edge)); index < perpendicular.length && perpendicular[index].line <= upper(edge); index++) {
      const segment = perpendicular[index];
      if (segment.layer!==layer || !within(line,segment)) continue;
      const point=horizontal ? {x:segment.line,y:line} : {x:line,y:segment.line};
      const cell=crossingCell(point);
      if (prior.cells.has(cell) || covered(point,prior.overlaps) || covered(point,parallelHits)) continue;
      // Two adjacent search edges count a crossing through their common vertex once.
      const atBoundary = segment.line === start || segment.line === end;
      hits.set(cell,Math.max(hits.get(cell)||0,atBoundary?.5:1));
    }
    costs.crossings=[...hits.values()].reduce((sum,value)=>sum+value,0);
    return costs;
  };
}

function chooseRoute(line, candidates, others, availableLayers, weights, existing=layerConflicts(others)) {
  let best=null, bestCost=null;
  for (const candidate of candidates) {
    const metrics=assess(candidate,others,existing);
    for (const layer of availableLayers) {
      const cost = metrics(layer);
      if (!best || compare(cost,bestCost,weights)<0) {
        best = layer===candidate.layer ? candidate : { ...candidate, layer };
        bestCost = cost;
      }
    }
  }
  return best || line;
}

const layerChoices = (line,canChange) => canChange ? [line.layer,...layers.filter(layer=>layer!==line.layer)] : [line.layer];

function tryRoute(line, others, ports, { allowLayerChanges, lane, weights, solidSlots, replace=false }) {
  const availableLayers=layerChoices(line,allowLayerChanges);
  const centered=!replace&&gridCentered(line);
  if (centered && !line.intrusions && !weights.overlap && !weights.bends) {
    return chooseRoute(line,[line],others,availableLayers,weights);
  }
  const otherLayers=new Set(others.map(other=>other.layer));
  const searchLayers=new Set(availableLayers.map(layer=>weights.overlap && otherLayers.has(layer)?layer:null));
  const existing=layerConflicts(others);
  const penalty=congestion(others,existing);
  const paths=new Map();
  if (centered) paths.set(pointsToPath(line.points),line);
  for (const layer of searchLayers) {
    const points=findArrangementPath(ports.get(line.route.from),ports.get(line.route.to),penalty(layer),
      {lane,overlap:weights.overlap,bends:weights.bends,solidSlots});
    if (!points) continue;
    const key=pointsToPath(points);
    if (!paths.has(key)) paths.set(key,geometry(line.route,points,ports,solidSlots));
  }
  return replace&&!paths.size ? null : chooseRoute(line,paths.values(),others,availableLayers,weights,existing);
}

const cellKey = ({slot,x,y}) => `${slot},${x},${y}`;
const localCell = ({x,y}) => `${x},${y}`;
const edgeInset = ({facing,x,y}) => ({ n:y, e:GRID_SIZE-1-x, s:GRID_SIZE-1-y, w:x }[facing] ?? 0);

function portLayout(ports,connected) {
  const groups=new Map();
  let inset=0, spread=0;
  for (const port of ports.values()) {
    if (!connected.has(port.id)) continue;
    inset+=edgeInset(port);
    const key=`${port.slot},${port.facing},${port.kind}`;
    const group=groups.get(key) || [];
    group.push(port);
    groups.set(key,group);
  }
  for (const group of groups.values()) {
    const xs=group.map(port=>port.x), ys=group.map(port=>port.y);
    spread+=Math.max(...xs)-Math.min(...xs)+Math.max(...ys)-Math.min(...ys);
  }
  return {inset,spread};
}

function optimizePorts(project, initialPorts, initialOutput, eligible, portCandidates, {allowLayerChanges,weights,solidSlots}) {
  const editable=new Set(eligible.map(line=>line.route.id));
  const incident=new Map();
  for (const route of project.routes) for (const id of new Set([route.from,route.to])) {
    if (!initialPorts.has(id)) continue;
    if (!incident.has(id)) incident.set(id,[]);
    incident.get(id).push(route.id);
  }
  const movable=new Map();
  for (const [id,routeIds] of incident) {
    const port=initialPorts.get(id);
    const cells=portCandidates?.[id];
    if (port.locked || !routeIds.every(routeId=>editable.has(routeId)) || !Array.isArray(cells)) continue;
    const valid=cells.filter(cell=>cell && (cell.slot==null || cell.slot===port.slot) && isPortCell(port.slot,cell.x,cell.y));
    if (valid.some(cell=>localCell(cell)!==localCell(port))) {
      movable.set(id,new Map(valid.map(cell=>[localCell(cell),cell])));
    }
  }
  const makePlan=(ports,output)=>({ports,output,metrics:measure([...output.values()]),layout:portLayout(ports,incident)});
  let best=makePlan(initialPorts,initialOutput);
  if (!movable.size) return best;
  const comparePlans=(a,b)=>a.metrics.platformIntrusions-b.metrics.platformIntrusions
    || compareLength(score(a.metrics,weights),score(b.metrics,weights))
    || a.layout.inset-b.layout.inset || a.layout.spread-b.layout.spread || compareLength(a.metrics.length,b.metrics.length);
  const allLines=[...initialOutput.values()];
  const priority=new Map();
  for (const line of eligible) {
    const placed=initialOutput.get(line.route.id);
    const peers=allLines.filter(peer=>peer!==placed);
    priority.set(line.route.id,score(assess(placed,peers)(placed.layer),weights));
  }
  const ids=[...movable.keys()].sort((a,b)=>{
    const total=id=>incident.get(id).reduce((sum,route)=>sum+priority.get(route),0);
    return total(b)-total(a);
  });
  // Limit the number of affected routes sent through A* across all move and swap trials.
  let budget=Math.min(144,Math.max(24,ids.length*4));
  for (const id of ids) {
    if (!budget) break;
    const port=best.ports.get(id);
    const occupied=new Map([...best.ports.values()].map(entry=>[cellKey(entry),entry]));
    const peers=incident.get(id).map(routeId=>{
      const route=best.output.get(routeId).route;
      return getPortPosition(best.ports.get(route.from===id?route.to:route.from));
    });
    const candidates=[];
    for (const cell of movable.get(id).values()) {
      if (localCell(cell)===localCell(port)) continue;
      const next={...port,x:cell.x,y:cell.y};
      const other=occupied.get(cellKey(next));
      if (other && !movable.get(other.id)?.has(localCell(port))) continue;
      const target=getPortPosition(next);
      const distance=peers.reduce((sum,point)=>sum+Math.abs(point.x-target.x)+Math.abs(point.y-target.y),0);
      const bends=peers.filter(point=>point.x!==target.x && point.y!==target.y).length;
      candidates.push({next,other,distance,bends});
    }
    candidates.sort((a,b)=>(a.bends-b.bends)*weights.bends || edgeInset(a.next)-edgeInset(b.next) || a.distance-b.distance);
    let proposal=best;
    for (const {next,other} of candidates.slice(0,6)) {
      const affected=new Set([...incident.get(id),...(other?incident.get(other.id):[])]);
      if (affected.size>budget) continue;
      budget-=affected.size;
      const ports=new Map(best.ports);
      ports.set(id,next);
      if (other) ports.set(other.id,{...other,x:port.x,y:port.y});
      const output=new Map(best.output);
      for (const routeId of affected) output.delete(routeId);
      for (const routeId of affected) {
        const line=tryRoute(best.output.get(routeId),[...output.values()],ports,{allowLayerChanges,weights,solidSlots,lane:0,replace:true});
        if (!line) break;
        output.set(routeId,line);
      }
      if (output.size!==best.output.size) continue;
      const candidate=makePlan(ports,output);
      if (comparePlans(candidate,proposal)<0) proposal=candidate;
    }
    best=proposal;
  }
  return best;
}

export function suggestArrangement(project, {
  allowLayerChanges = true, includeManual = true, weights:inputWeights, arrangePorts = false, portCandidates,
} = {}) {
  const weights=normalizeArrangeWeights(inputWeights);
  const ports = new Map(project.ports.map(port => [port.id, port]));
  const solidSlots=new Set([-1]);
  if (Array.isArray(project.modules)) {
    project.modules.forEach((module,slot)=>{ if (module) solidSlots.add(slot); });
  } else {
    for (const port of ports.values()) solidSlots.add(port.slot);
  }
  const source = new Map(project.routes.map(route => [route.id, route]));
  const current = buildRoutes(project).map(line => geometry(source.get(line.id),line.points,ports,solidSlots,line.segments));
  const before = measure(current,true);
  const original = new Map(current.map(line => [line.route.id, line]));
  const eligible = current.filter(({ route }) => !route.locked && ports.has(route.to) && (includeManual || !route.manual));
  const locked = project.routes.filter(route => route.locked).length;
  const loose = project.routes.filter(route => route.to == null && route.looseEnd).length;
  const previous = displayMetrics(before,weights);
  const unchanged = () => ({ routes:project.routes.slice(), ports:project.ports.slice(), before:previous, after:previous,
    changed:0, movedPorts:0, locked, loose, weights });
  if (!eligible.length || Object.values(weights).every(weight=>weight===0)) return unchanged();
  const priority = new Map(eligible.map(line => {
    const occupied = current.filter(other => other !== line);
    return [line.route.id, assess(line, occupied)(line.layer)];
  }));
  eligible.sort((a, b) => {
    const first = priority.get(a.route.id);
    const second = priority.get(b.route.id);
    return compare(second,first,weights);
  });

  function reroute(output, order, pass) {
    for (const entry of order) {
      const id = entry.route.id;
      const line = output.get(id) ?? entry;
      const others = [...output.values()].filter(other => other.route.id !== id);
      const lane = pass % 2 ? CELL_SIZE : 0;
      const next = tryRoute(line,others,ports,{allowLayerChanges,lane,weights,solidSlots});
      output.set(id, next);
    }
  }

  // Compare incremental repair with fresh placements when a tradeoff needs
  // more than one route to move.
  let output = new Map(original);
  reroute(output, eligible, 0);
  if (eligible.length <= 48) reroute(output, [...eligible].reverse(), 1);
  let after = measure([...output.values()]);
  if (score(after,weights)>0 && eligible.length > 1 && eligible.length <= 48) {
    const editable = new Set(eligible.map(line => line.route.id));
    const fixed = current.filter(line => !editable.has(line.route.id));
    const plans = [
      { order: [...eligible].sort((a, b) => a.length - b.length), paired: 0 },
      { order: [...eligible].sort((a, b) => b.length - a.length), paired: 0 },
    ];
    if (eligible.length <= 18) {
      const conflicts = [];
      for (const [index, line] of eligible.entries()) for (const other of eligible.slice(0, index)) {
        const first=output.get(line.route.id), second=output.get(other.route.id);
        if (first.layer!==second.layer) continue;
        const collision = interference(first,second);
        if (weights.overlap && (collision.overlap || collision.hits.length)) {
          conflicts.push([line, other]);
        }
      }
      for (const pair of conflicts.slice(0, 2)) {
        const remaining = eligible.filter(line => !pair.includes(line));
        plans.push({ order: [...pair, ...remaining], paired: 2 }, { order: [pair[1], pair[0], ...remaining], paired: 2 });
      }
    }
    for (const [index, { order, paired }] of plans.entries()) {
      const candidate = new Map(fixed.map(line => [line.route.id, line]));
      reroute(candidate, order, index);
      reroute(candidate, order.slice(paired).reverse(), index + 1);
      const metrics = measure([...candidate.values()]);
      if (compare(metrics,after,weights) < 0) {
        output = candidate;
        after = metrics;
      }
      if (score(after,weights)===0) break;
    }
  }
  if (allowLayerChanges) {
    for (const order of [eligible,[...eligible].reverse()]) for (const entry of order) {
      const id=entry.route.id;
      const line=output.get(id);
      const others=[...output.values()].filter(other=>other!==line);
      output.set(id,chooseRoute(line,[line],others,layerChoices(line,true),weights));
    }
    after = measure([...output.values()]);
  }
  let arrangedPorts=ports;
  if (arrangePorts && portCandidates) {
    const joint=optimizePorts(project,ports,output,eligible,portCandidates,{allowLayerChanges,weights,solidSlots});
    arrangedPorts=joint.ports;
    output=joint.output;
    after=joint.metrics;
  }
  const nextPorts=project.ports.map(port=>arrangedPorts.get(port.id));
  const movedPorts=nextPorts.filter((port,index)=>localCell(port)!==localCell(project.ports[index])).length;
  const validGrid=eligible.every(line=>gridCentered(output.get(line.route.id)));
  const fixesGrid=validGrid && eligible.some(line=>!gridCentered(line));
  const fixesPlatform=after.platformIntrusions<before.platformIntrusions;
  const scoreChange=compareLength(score(after,weights),score(before,weights));
  const shortens=compareLength(after.length,before.length)<0;
  if (!validGrid || after.platformIntrusions>before.platformIntrusions
      || !fixesGrid && !fixesPlatform && (scoreChange>0 || scoreChange===0 && !movedPorts&&!shortens)) return unchanged();
  const changed = current.filter(line => {
    const next = output.get(line.route.id);
    return line.layer !== next.layer || pointsToPath(line.points) !== pointsToPath(next.points);
  }).length;
  const summary = { before:previous, after:displayMetrics(measure([...output.values()],true),weights), changed, movedPorts, locked, loose, weights };
  if (!changed && !movedPorts) return unchanged();

  const routes = project.routes.map(route => {
    const line = output.get(route.id);
    // Snapshot any old automatic path so it cannot shift after other paths are installed.
    if (!line || route.to == null || route.manual && original.get(route.id) === line) return route;
    return { ...route, layer: line.layer, manual: true, bends: line.points.slice(1, -1) };
  });
  return { routes, ports:nextPorts, ...summary };
}

const abortError = () => new DOMException('布线整理已取消。','AbortError');

export async function requestArrangement(project, options, { signal } = {}) {
  if (signal?.aborted) throw abortError();
  if (typeof Worker === 'undefined') return suggestArrangement(project, options);
  const worker = new Worker(new URL('./arrange-worker.js', import.meta.url), { type: 'module' });
  let abort;
  try {
    return await new Promise((resolve, reject) => {
      abort=()=>reject(abortError());
      signal?.addEventListener('abort',abort,{once:true});
      worker.addEventListener('message', ({ data }) => {
        if (data.error) reject(new Error(data.error));
        else resolve(data.result);
      }, { once: true });
      worker.addEventListener('error', event => {
        event.preventDefault();
        reject(new Error(event.message || '无法运行布线整理。'));
      }, { once: true });
      worker.postMessage({ project, options });
    });
  } finally {
    signal?.removeEventListener('abort',abort);
    worker.terminate();
  }
}
