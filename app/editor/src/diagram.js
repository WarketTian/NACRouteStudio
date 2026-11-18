// Keep the existing drawing origin so absolute freehand points survive a layout upgrade.
export const BOARD_CENTER = 520;
export const BOARD_SIZE = 1120;
export const BOARD_MIN = BOARD_CENTER - BOARD_SIZE / 2;
export const BOARD_MAX = BOARD_CENTER + BOARD_SIZE / 2;
export const GRID_SIZE = 7;
export const CELL_SIZE = 20;
export const GRID_ORIGIN = 10;
export const GRID_CENTER = GRID_ORIGIN + CELL_SIZE / 2;

export function snapGridCoordinate(value) {
  return GRID_CENTER + Math.round((value - GRID_CENTER) / CELL_SIZE) * CELL_SIZE;
}

// GregTech dye IDs. Values are tuned for visibility on the drafting surface.
export const DYE_COLORS = [
  { name: '黑色', hex: '#1b2028' }, { name: '红色', hex: '#db353e' },
  { name: '绿色', hex: '#248538' }, { name: '棕色', hex: '#754424' },
  { name: '蓝色', hex: '#345ace' }, { name: '紫色', hex: '#763ac4' },
  { name: '青色', hex: '#008c96' }, { name: '淡灰色', hex: '#b9c5ce' },
  { name: '灰色', hex: '#636d76' }, { name: '粉红色', hex: '#df77a4' },
  { name: '黄绿色', hex: '#75a41b' }, { name: '黄色', hex: '#d1a608' },
  { name: '淡蓝色', hex: '#43a7de' }, { name: '品红色', hex: '#b83791' },
  { name: '橙色', hex: '#e67b26' }, { name: '白色', hex: '#fffdf4' },
];

export const LAYER_STYLES = [
  { name: '基面', dash: '', lineCap: 'butt' },
  { name: '−1 层', dash: '17 9', lineCap: 'butt' },
  { name: '−2 层', dash: '11 7', lineCap: 'butt' },
  { name: '−3 层', dash: '6 5', lineCap: 'butt' },
];

export const RETURN_STYLE = { name: '成品回流', dash: '0 15', lineCap: 'round' };

export function routeStrokeStyle(layer, returning = false) {
  return returning ? RETURN_STYLE : LAYER_STYLES[layer] ?? LAYER_STYLES[0];
}

export const ROUTE_PAINT = { line:3.25, halo:5.5, returnLine:4.2, returnEdge:6.8 };
export const ROUTE_CORNER_RADIUS = 6;
export const ROUTE_CUT_RADIUS = 1;

const PLATFORM = GRID_SIZE * CELL_SIZE;
export const ROUTE_CLEARANCE = CELL_SIZE / 2;
const LEGACY_CENTERS = [
  [-138, -423], [138, -423], [307, -307], [423, -138],
  [423, 138], [307, 307], [138, 423], [-138, 423],
  [-307, 307], [-423, 138], [-423, -138], [-307, -307],
];
const PREVIOUS_CENTERS = LEGACY_CENTERS.map(offsets => offsets.map(offset => Math.round(offset / CELL_SIZE) * CELL_SIZE));
// GT5U 5.09.54.265, AssemblyComplexStructureString: platform centers in blocks
// relative to the center of the 7×7 control room, in saved slot order.
const CENTERS = [
  [-8,-23], [8,-23], [17,-17], [23,-8], [23,8], [17,17],
  [8,23], [-8,23], [-17,17], [-23,8], [-23,-8], [-17,-17],
].map(offset => offset.map(value => value * CELL_SIZE));
const FACING = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

function platformAt(slot, centers) {
  const [offsetX, offsetY] = centers[slot] ?? [0, 0];
  const cx = BOARD_CENTER + offsetX;
  const cy = BOARD_CENTER + offsetY;
  return { x: cx - PLATFORM / 2, y: cy - PLATFORM / 2, width: PLATFORM, height: PLATFORM, cx, cy };
}

export function getPlatform(slot) {
  return platformAt(slot, CENTERS);
}

export function getCell(slot, x, y) {
  const platform = getPlatform(slot);
  const left = platform.x + x * CELL_SIZE;
  const top = platform.y + y * CELL_SIZE;
  return { x: left, y: top, width: CELL_SIZE, height: CELL_SIZE, cx: left + CELL_SIZE / 2, cy: top + CELL_SIZE / 2 };
}

export function getPortPosition(port) {
  const cell = getCell(port.slot, port.x, port.y);
  return { x: cell.cx, y: cell.cy };
}

export function getLegacyPortPosition(port, layout = 0) {
  const platform = platformAt(port.slot, layout === 1 ? PREVIOUS_CENTERS : LEGACY_CENTERS);
  return { x:platform.x + (port.x + .5) * CELL_SIZE, y:platform.y + (port.y + .5) * CELL_SIZE };
}

export function getFootprint(slot) {
  const { x, y, width } = getPlatform(slot);
  if (slot === -1) return [[x, y], [x + width, y], [x + width, y + width], [x, y + width]];
  const edge = CELL_SIZE;
  return [
    [x + edge, y], [x + width - edge, y], [x + width - edge, y + edge],
    [x + width, y + edge], [x + width, y + width - edge], [x + width - edge, y + width - edge],
    [x + width - edge, y + width], [x + edge, y + width], [x + edge, y + width - edge],
    [x, y + width - edge], [x, y + edge], [x + edge, y + edge],
  ];
}

const obstacles = [-1, ...CENTERS.keys()].map((slot) => {
  const box = getPlatform(slot);
  return {
    left: box.x - ROUTE_CLEARANCE, top: box.y - ROUTE_CLEARANCE,
    right: box.x + box.width + ROUTE_CLEARANCE, bottom: box.y + box.height + ROUTE_CLEARANCE,
  };
});

function direction(port, point, other) {
  if (FACING[port.facing]) return FACING[port.facing];
  const dx = other.x - point.x;
  const dy = other.y - point.y;
  if (Math.abs(dx) > Math.abs(dy)) return FACING[dx < 0 ? 'w' : 'e'];
  return FACING[dy < 0 ? 'n' : 's'];
}

function escapePort(port, point, other, clearance, grid = false, blocked = obstacles) {
  const box = obstacles[port.slot + 1];
  const [dx, dy] = direction(port, point, other);
  const horizontal = dx !== 0;
  const sign = dx || dy;
  const fixed = horizontal ? point.y : point.x;
  const edge = horizontal ? (sign < 0 ? box.left : box.right) : (sign < 0 ? box.top : box.bottom);
  let available = sign < 0 ? edge - BOARD_MIN - 4 : BOARD_MAX - edge - 4;
  for (const neighbor of blocked) {
    if (neighbor === box) continue;
    const [min, max] = horizontal ? [neighbor.top, neighbor.bottom] : [neighbor.left, neighbor.right];
    if (fixed <= min || fixed >= max) continue;
    const near = horizontal ? (sign < 0 ? neighbor.right : neighbor.left) : (sign < 0 ? neighbor.bottom : neighbor.top);
    const gap = (near - edge) * sign;
    if (gap >= 0) available = Math.min(available, gap);
  }
  const extra = Math.min(clearance, available);
  const end = edge + (grid ? Math.floor(extra / CELL_SIZE) * CELL_SIZE : extra) * sign;
  return horizontal ? { x: end, y: fixed } : { x: fixed, y: end };
}

function inside(point, box) {
  return point.x > box.left && point.x < box.right && point.y > box.top && point.y < box.bottom;
}

function overlaps(first, second, third, fourth) {
  return Math.max(0, Math.min(Math.max(first, second), Math.max(third, fourth)) - Math.max(Math.min(first, second), Math.min(third, fourth)));
}

function segmentBlocked(a, b, blocked) {
  if (a.y === b.y) {
    return blocked.some((box) => a.y > box.top && a.y < box.bottom && overlaps(a.x, b.x, box.left, box.right));
  }
  return blocked.some((box) => a.x > box.left && a.x < box.right && overlaps(a.y, b.y, box.top, box.bottom));
}

class Queue {
  values = [];

  constructor(compare) {
    this.compare = compare;
  }

  push(value) {
    const heap = this.values;
    let index = heap.length;
    heap.push(value);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(heap[parent].priority, value.priority) <= 0) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = value;
  }

  pop() {
    const heap = this.values;
    const first = heap[0];
    const last = heap.pop();
    if (!heap.length) return first;
    let index = 0;
    while (index * 2 + 1 < heap.length) {
      let child = index * 2 + 1;
      if (child + 1 < heap.length && this.compare(heap[child + 1].priority, heap[child].priority) < 0) child++;
      if (this.compare(heap[child].priority, last.priority) >= 0) break;
      heap[index] = heap[child];
      index = child;
    }
    heap[index] = last;
    return first;
  }
}

const edgeX = obstacles.flatMap(({ left, right }) => [left, right]);
const edgeY = obstacles.flatMap(({ top, bottom }) => [top, bottom]);
const firstTrack = snapGridCoordinate(BOARD_MIN);
const lastTrack = snapGridCoordinate(BOARD_MAX);
const centerTracks = Array.from({ length:(lastTrack - firstTrack) / CELL_SIZE + 1 },
  (_, index) => firstTrack + index * CELL_SIZE);
const sortedUnique = (values) => [...new Set(values)].sort((a, b) => a - b);
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const arrangementOrder = (a, b) => (Math.abs(a[0] - b[0]) > 1e-7 ? a[0] - b[0] : 0) || a[1] - b[1];
const reversesLead = (lead,a,b) => (b.x-a.x)*lead.x+(b.y-a.y)*lead.y<0;

function connect(a, b, occupied, lane, options = {}) {
  if (a.x === b.x && a.y === b.y) return [a];
  const xs = options.grid ? centerTracks : sortedUnique([BOARD_MIN + 8, BOARD_MAX - 8, a.x, b.x, (a.x + b.x) / 2 + lane, ...edgeX, ...edgeX.map((x) => x + lane)]);
  const ys = options.grid ? centerTracks : sortedUnique([BOARD_MIN + 8, BOARD_MAX - 8, a.y, b.y, (a.y + b.y) / 2 + lane, ...edgeY, ...edgeY.map((y) => y + lane)]);
  if (options.grid && (!xs.includes(a.x) || !ys.includes(a.y) || !xs.includes(b.x) || !ys.includes(b.y))) return null;
  const startDir = options.startDir ?? 0;
  const blocked = options.blocked ?? obstacles;
  const ordered = !!options.penalty;
  const compare = ordered ? arrangementOrder : (first, second) => first - second;
  const initialCost = ordered ? [0, 0] : 0;
  const priority = (cost, remaining) => ordered ? [cost[0], cost[1] + remaining] : cost + remaining;
  const origin = { xi: xs.indexOf(a.x), yi: ys.indexOf(a.y), dir: startDir, point: a, cost: initialCost, priority: priority(initialCost, distance(a, b)) };
  const key = (xi, yi, dir) => (yi * xs.length + xi) * 3 + dir;
  const costs = new Map([[key(origin.xi, origin.yi, startDir), initialCost]]);
  const penalties = ordered && new Map();
  const queue = new Queue(compare);
  queue.push(origin);
  while (queue.values.length) {
    const current = queue.pop();
    const { xi, yi, point, dir, cost } = current;
    if (cost !== costs.get(key(xi, yi, dir))) continue;
    if (point.x === b.x && point.y === b.y) {
      const result = [];
      for (let node = current; node; node = node.previous) result.push(node.point);
      return result.reverse();
    }
    for (const [x, y, nextDir] of [[xi - 1, yi, 1], [xi + 1, yi, 1], [xi, yi - 1, 2], [xi, yi + 1, 2]]) {
      if (x < 0 || x >= xs.length || y < 0 || y >= ys.length) continue;
      const next = { x: xs[x], y: ys[y] };
      const endpoint = next.x === b.x && next.y === b.y;
      if (!endpoint && blocked.some((box) => inside(next, box))) continue;
      if (segmentBlocked(point, next, blocked)) continue;
      // A vertical terminal can release its own floor, but a horizontal
      // terminal on the same floor must still approach its facing lead.
      if (options.startLead && point.x===a.x && point.y===a.y && reversesLead(options.startLead,point,next)
          || options.endLead && endpoint && reversesLead(options.endLead,point,next)) continue;
      const line = nextDir === 1 ? `h${next.y}` : `v${next.x}`;
      const start = nextDir === 1 ? point.x : point.y;
      const end = nextDir === 1 ? next.x : next.y;
      const turn = Number(dir !== 0 && nextDir !== dir);
      const terminalTurn = Number(endpoint && !!options.endDir && nextDir !== options.endDir);
      const length = distance(point, next);
      let nextCost;
      if (ordered) {
        const edge = `${line}:${Math.min(start, end)}`;
        if (!penalties.has(edge)) penalties.set(edge, options.penalty(nextDir === 1, nextDir === 1 ? next.y : next.x, start, end));
        const penalty = penalties.get(edge);
        const weight = (penalty.overlap/CELL_SIZE + penalty.crossings) * options.overlapWeight + (turn+terminalTurn) * options.bendWeight;
        nextCost = [cost[0]+weight, cost[1]+length];
      } else {
        const overlap = (occupied.get(line) ?? []).reduce((sum, segment) => sum + overlaps(start, end, ...segment), 0);
        nextCost = cost + length + turn * 17 + overlap * 1.8;
      }
      const id = key(x, y, nextDir);
      const best = costs.get(id);
      if (best != null && compare(nextCost, best) >= 0) continue;
      costs.set(id, nextCost);
      queue.push({ xi: x, yi: y, dir: nextDir, point: next, cost: nextCost, priority: priority(nextCost, distance(next, b)), previous: current });
    }
  }
  // Explicit bend points may be placed over a platform by an imported design.
  return options.fallback === false ? null : [a, { x: b.x, y: a.y }, b];
}

// Use the same platform clearances and facing leads as the interactive router.
export function findArrangementPath(from, to, penalty, { lane = 0, overlap = 1, bends = 1, solidSlots } = {}) {
  const start = getPortPosition(from);
  const end = getPortPosition(to);
  const fromVertical = from.facing==='up' || from.facing==='down';
  const toVertical = to.facing==='up' || to.facing==='down';
  const blocked = obstacles.filter((_,index) => {
    const slot=index-1;
    return (solidSlots?.has(slot) ?? true) && !(fromVertical&&slot===from.slot) && !(toVertical&&slot===to.slot);
  });
  const a = fromVertical ? start : escapePort(from,start,end,lane,true,blocked);
  const b = toVertical ? end : escapePort(to,end,start,lane,true,blocked);
  const heading = (p,q) => p.x!==q.x ? 1 : p.y!==q.y ? 2 : 0;
  const needsLeads = from.slot===to.slot && fromVertical!==toVertical;
  const middle = connect(a, b, new Map(), lane, {
    penalty, grid:true, overlapWeight:overlap, bendWeight:bends, blocked,
    startDir:heading(start,a), endDir:heading(b,end), fallback:false,
    startLead:needsLeads&&!fromVertical ? {x:a.x-start.x,y:a.y-start.y} : null,
    endLead:needsLeads&&!toVertical ? {x:end.x-b.x,y:end.y-b.y} : null,
  });
  return middle && simplify([start, ...middle, end]);
}

function simplify(points) {
  const result = [];
  for (const point of points) {
    while (result.length > 1) {
      const last = result.at(-1);
      const previous = result.at(-2);
      const vertical = previous.x === last.x && last.x === point.x;
      const horizontal = previous.y === last.y && last.y === point.y;
      if (!vertical && !horizontal) break;
      // A collinear turn retraces a segment and leaves a spur when a loose end moves past it.
      result.pop();
    }
    const last = result.at(-1);
    if (!last || last.x !== point.x || last.y !== point.y) result.push(point);
  }
  return result;
}

const isPoint = (value) => Number.isFinite(value?.x) && Number.isFinite(value?.y);

export function pointsToPath(points) {
  return points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ');
}

function roundedCorner(a, vertex, b) {
  const inX = vertex.x - a.x, inY = vertex.y - a.y;
  const outX = b.x - vertex.x, outY = b.y - vertex.y;
  const inLength = Math.hypot(inX, inY), outLength = Math.hypot(outX, outY);
  if (!inLength || !outLength || inX * outX + inY * outY !== 0) return null;
  const radius = Math.min(ROUTE_CORNER_RADIUS, inLength / 2, outLength / 2);
  return {
    enter:{ x:vertex.x - inX / inLength * radius, y:vertex.y - inY / inLength * radius },
    exit:{ x:vertex.x + outX / outLength * radius, y:vertex.y + outY / outLength * radius },
    radius,
    sweep:Number(inX * outY - inY * outX > 0),
  };
}

export function routeRenderGeometry(points) {
  if (!points.length) return { path:'', straights:[] };
  const commands = [`M${points[0].x} ${points[0].y}`];
  const straights = [];
  let a = points[0], offset = 0;
  for (let index = 1; index < points.length; index++) {
    const vertex = points[index];
    const next = points[index + 1];
    const corner = next && roundedCorner(points[index - 1], vertex, next);
    const b = corner ? corner.enter : vertex;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length) {
      commands.push(`L${b.x} ${b.y}`);
      straights.push({ a,b,length,start:offset });
      offset += length;
    }
    if (corner) {
      const { radius, sweep, exit } = corner;
      commands.push(`A${radius} ${radius} 0 0 ${sweep} ${exit.x} ${exit.y}`);
      offset += radius * Math.PI / 2;
    }
    a = corner ? corner.exit : b;
  }
  return { path:commands.join(' '), straights };
}

export function roundedRoutePath(points) {
  return routeRenderGeometry(points).path;
}

// Explicit paths keep the user's coordinates, including bends over a platform or beyond the grid.
function orthogonal(points, horizontalFirst = null) {
  const result = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (previous && previous.x !== point.x && previous.y !== point.y) {
      const horizontal = horizontalFirst ?? (Math.abs(point.x - previous.x) >= Math.abs(point.y - previous.y));
      result.push(horizontal ? { x: point.x, y: previous.y } : { x: previous.x, y: point.y });
    }
    result.push(point);
  }
  return simplify(result);
}

function facingLead(port, point, other, snap) {
  const [dx, dy] = direction(port, point, other);
  const separation = distance(point, other);
  const length = snap ? (separation >= CELL_SIZE * 2 ? CELL_SIZE : 0) : Math.min(CELL_SIZE, separation / 3);
  return { x: point.x + dx * length, y: point.y + dy * length };
}

export function draftRoutePoints(port, target, bends = [], { snap = false } = {}) {
  if (!port || !isPoint(target)) return [];
  const start = getPortPosition(port);
  const targetIsPort = Number.isInteger(target.slot);
  const end = targetIsPort ? getPortPosition(target) : { x: target.x, y: target.y };
  const interior = bends.filter(isPoint);
  if (interior.length) return orthogonal([start, ...interior, end]);
  const first = facingLead(port, start, end, snap);
  const last = targetIsPort ? facingLead(target, end, start, snap) : end;
  return orthogonal([start, first, last, end]);
}

export function nearestRouteSegment(geometry, point) {
  if (!isPoint(point)) return -1;
  const points = geometry?.points || [];
  let best = -1;
  let minimum = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const px = Math.min(Math.max(point.x, Math.min(a.x, b.x)), Math.max(a.x, b.x));
    const py = Math.min(Math.max(point.y, Math.min(a.y, b.y)), Math.max(a.y, b.y));
    const squared = (point.x - px) ** 2 + (point.y - py) ** 2;
    if (squared < minimum) {
      minimum = squared;
      best = i - 1;
    }
  }
  return best;
}

export function dragRouteSegment(geometry, index, point, { snap = false } = {}) {
  const points = geometry?.points;
  if (geometry?.locked || !isPoint(point) || !points?.[index + 1] || !points[index]) return null;
  const a = points[index];
  const b = points[index + 1];
  const horizontal = a.y === b.y;
  const normal = horizontal ? 'y' : 'x';
  const tangent = horizontal ? 'x' : 'y';
  const target = Math.round(point[normal] * 2) / 2;
  if (Math.abs(a[normal] - target) < 0.25) return null;

  const leading = points.slice(0, index);
  const trailing = points.slice(index + 2);
  const hasStart = leading.length === 0;
  const hasEnd = trailing.length === 0;
  const sign = Math.sign(b[tangent] - a[tangent]);
  const lead = Math.min(14, Math.abs(b[tangent] - a[tangent]) / 3);
  const leadTangent = (value, direction) => snap ? snapGridCoordinate(value + direction * CELL_SIZE) : value + direction * lead;
  const entryTangent = hasStart ? leadTangent(a[tangent], sign) : a[tangent];
  const exitTangent = hasEnd ? leadTangent(b[tangent], -sign) : b[tangent];
  const hasRoom = (exitTangent - entryTangent) * sign > 0;
  const entry = hasStart && hasRoom ? { ...a, [tangent]: entryTangent } : a;
  const exit = hasEnd && hasRoom ? { ...b, [tangent]: exitTangent } : b;
  if (hasStart) leading.push(a, entry);
  if (hasEnd) trailing.push(exit, b);

  const moved = orthogonal([
    ...leading, { ...entry, [normal]: target }, { ...exit, [normal]: target }, ...trailing,
  ], !horizontal);
  return { bends: moved.slice(1, -1), manual: true };
}

export function routeLabelPoint(geometry) {
  const points = geometry?.points || [];
  let longest = 0;
  let label = null;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const length = distance(a, b);
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (length <= longest || obstacles.some(box => inside(middle, box))) continue;
    longest = length;
    label = { ...middle, horizontal: a.y === b.y };
  }
  if (label) return label;
  const point = points[Math.floor(points.length / 2)];
  return point ? { ...point, horizontal: true } : null;
}

const dyeId = (value) => Number.isInteger(value) && value >= 0 && value < DYE_COLORS.length;
const rgb = DYE_COLORS.map(({ hex }) => hex.slice(1).match(/../g).map(value => Number.parseInt(value, 16)));
const colorDistance = (a, b) => rgb[a].reduce((sum, channel, index) => sum + (channel - rgb[b][index]) ** 2, 0);
const neutralDyes = new Set([0, 7, 8, 15]);

export function chooseRouteColor(project, from, to = null) {
  const ports = new Map((project.ports ?? []).map(port => [port.id, port]));
  const endpoints = [from?.id, to?.id].filter(Boolean);
  const counts = new Map();
  for (const route of project.routes ?? []) {
    if (!endpoints.includes(route.from) && !endpoints.includes(route.to)) continue;
    const index = dyeId(route.displayColor) ? route.displayColor : ports.get(route.from)?.color;
    if (dyeId(index)) counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  const preferred = dyeId(from?.color) ? from.color : 6;
  if (!counts.has(preferred)) return preferred;
  return DYE_COLORS.map((_, index) => index).sort((a, b) => {
    const countDifference = (counts.get(a) ?? 0) - (counts.get(b) ?? 0);
    if (countDifference) return countDifference;
    const neutralDifference = Number(neutralDyes.has(a)) - Number(neutralDyes.has(b));
    if (!counts.has(a) && neutralDifference) return neutralDifference;
    const contrast = (color) => Math.min(...[...counts.keys()].map(other => colorDistance(color, other)));
    return contrast(b) - contrast(a);
  })[0];
}

export function routeSegments(points) {
  return points.slice(1).map((b, index) => {
    const a = points[index];
    const horizontal = a.y === b.y;
    return { horizontal, line: horizontal ? a.y : a.x, start: horizontal ? a.x : a.y, end: horizontal ? b.x : b.y };
  });
}

function crosses(upper, lower) {
  if (upper.horizontal === lower.horizontal) return false;
  return lower.line > Math.min(upper.start, upper.end) + 5 && lower.line < Math.max(upper.start, upper.end) - 5
    && upper.line > Math.min(lower.start, lower.end) + 5 && upper.line < Math.max(lower.start, lower.end) - 5;
}

export function isCoreReturn(from, to) {
  return from?.kind === 'out' && to?.slot === -1 && to.kind === 'final';
}

export function buildRoutes(project) {
  const ports = new Map((project.ports ?? []).map((port) => [port.id, port]));
  const routes = [...(project.routes ?? [])].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));
  const occupied = new Map();
  const result = [];
  for (const route of routes) {
    const from = ports.get(route.from);
    const to = ports.get(route.to);
    const loose = route.to == null && isPoint(route.looseEnd);
    if (!from || !obstacles[from.slot + 1] || (!loose && (!to || !obstacles[to.slot + 1]))) continue;
    const start = getPortPosition(from);
    const end = loose ? route.looseEnd : getPortPosition(to);
    const lane = (result.length % 4 + 1) * 5;
    const bends = (route.bends ?? []).filter(isPoint);
    let clean;
    if (route.manual) {
      clean = orthogonal([start, ...bends, end]);
    } else if (loose) {
      clean = draftRoutePoints(from, end, bends);
    } else {
      const fromEdge = escapePort(from, start, end, lane);
      const toEdge = escapePort(to, end, start, lane);
      const waypoints = [fromEdge, ...bends, toEdge];
      const points = [start];
      for (let index = 1; index < waypoints.length; index++) {
        points.push(...connect(waypoints[index - 1], waypoints[index], occupied, lane));
      }
      points.push(end);
      clean = simplify(points);
    }
    const pieces = routeSegments(clean);
    for (const part of pieces) {
      const key = `${part.horizontal ? 'h' : 'v'}${part.line}`;
      if (!occupied.has(key)) occupied.set(key, []);
      occupied.get(key).push([part.start, part.end]);
    }
    const colorIndex = from.color;
    const displayColorIndex = dyeId(route.displayColor) ? route.displayColor : colorIndex;
    const channelColor = DYE_COLORS[colorIndex]?.hex ?? '#526a80';
    const color = DYE_COLORS[displayColorIndex]?.hex ?? channelColor;
    const returning = isCoreReturn(from, to);
    const { dash, lineCap } = routeStrokeStyle(route.layer, returning);
    result.push({ ...route, loose, returning, points: clean, path: pointsToPath(clean), paintPath: roundedRoutePath(clean),
      color, colorIndex, displayColorIndex, channelColor, dash, lineCap, bridges: [], segments: pieces });
  }
  // Keep legacy automatic layout order above, then paint the deepest lines first.
  result.sort((a, b) => (b.layer ?? 0) - (a.layer ?? 0));
  result.forEach((route, index) => {
    for (const deeper of result.slice(0, index)) {
      const depth = deeper.layer ?? 0;
      if ((route.layer ?? 0) === depth) continue;
      for (const part of route.segments) {
        for (const old of deeper.segments) {
          if (!crosses(part, old)) continue;
          const x = part.horizontal ? old.line : part.line;
          const y = part.horizontal ? part.line : old.line;
          const bridge = route.bridges.find(entry => entry.x === x && entry.y === y && entry.layer === depth);
          if (!bridge) route.bridges.push({ x, y, horizontal: part.horizontal, layer: depth, routes:[deeper.id] });
          else if (!bridge.routes.includes(deeper.id)) bridge.routes.push(deeper.id);
        }
      }
    }
  });
  return result;
}

// Keep the grid and neighboring traces intact by masking only the line below each crossing.
export function routeCutouts(routes) {
  const visible = new Set(routes.map(route => route.id));
  const byRoute = new Map();
  for (const upper of routes) for (const bridge of upper.bridges) {
    const gap = upper.returning ? 9.5 : 7.5;
    const width = bridge.horizontal ? 9.5 : gap;
    const height = bridge.horizontal ? gap : 9.5;
    const cut = { x:bridge.x - width / 2, y:bridge.y - height / 2, width, height };
    for (const id of bridge.routes) {
      if (!visible.has(id)) continue;
      if (!byRoute.has(id)) byRoute.set(id, new Map());
      const cuts = byRoute.get(id);
      const key = `${bridge.x},${bridge.y},${bridge.horizontal}`;
      const previous = cuts.get(key);
      if (!previous || previous.width * previous.height < width * height) cuts.set(key, cut);
    }
  }
  return new Map([...byRoute].map(([id, cuts]) => [id, [...cuts.values()]]));
}
