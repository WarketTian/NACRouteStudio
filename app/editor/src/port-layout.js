import { GRID_SIZE, snapGridCoordinate } from './diagram.js';

export function isPortCell(slot, x, y, canPlace) {
  if (!Number.isInteger(slot) || slot < -1 || slot > 11) return false;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) return false;
  const corner = (x === 0 || x === GRID_SIZE - 1) && (y === 0 || y === GRID_SIZE - 1);
  return (slot === -1 || !corner) && (canPlace?.(slot,x,y) ?? true);
}

export function translatePortGroup(project, ids, dx, dy, canPlace) {
  const originals = project.ports.filter(port => ids.has(port.id));
  const slot = originals[0]?.slot;
  const ports = originals.map(port => ({ ...port,x:port.x+dx,y:port.y+dy }));
  if (!originals.length || originals.length !== ids.size || ports.some(port => port.slot !== slot)) {
    return { ports,problem:'footprint' };
  }
  if (originals.some(port => port.locked === true)) return { ports,problem:'port-locked' };
  if (project.routes.some(route => route.locked && (ids.has(route.from) || ids.has(route.to)))) {
    return { ports,problem:'locked' };
  }
  if (ports.some(({ x,y }) => !isPortCell(slot,x,y,canPlace))) return { ports,problem:'footprint' };
  const occupied = new Set(project.ports.filter(port => port.slot === slot && !ids.has(port.id)).map(port => `${port.x},${port.y}`));
  for (const { x,y } of ports) {
    const cell = `${x},${y}`;
    if (occupied.has(cell)) return { ports,problem:'occupied' };
    occupied.add(cell);
  }
  return { ports,problem:null };
}

export function reanchorPortBends(points, start, end) {
  if (points.length < 2) return [];
  const beforeStart = points[0], beforeEnd = points.at(-1);
  const dx = start.x - beforeStart.x, dy = start.y - beforeStart.y;
  const bends = points.slice(1,-1).map(point => ({ ...point }));
  if (end.x - beforeEnd.x === dx && end.y - beforeEnd.y === dy) {
    return bends.map(point => ({ x:point.x+dx,y:point.y+dy }));
  }
  if (!bends.length) {
    if (start.x === end.x || start.y === end.y) return [];
    if (beforeStart.x === beforeEnd.x) {
      const y = snapGridCoordinate((start.y+end.y)/2);
      return [{ x:start.x,y },{ x:end.x,y }];
    }
    const x = snapGridCoordinate((start.x+end.x)/2);
    return [{ x,y:start.y },{ x,y:end.y }];
  }
  const firstAxis = beforeStart.x === points[1].x ? 'x' : 'y';
  const lastAxis = beforeEnd.x === points.at(-2).x ? 'x' : 'y';
  bends[0][firstAxis] = start[firstAxis];
  bends.at(-1)[lastAxis] = end[lastAxis];
  return bends;
}
