import { getFootprint, routeRenderGeometry } from './diagram.js';

export const ROUTE_ARROW_POINTS = [[-5.5,-3.6], [6,0], [-5.5,3.6], [-3,0]];
export const ROUTE_ARROW_PATH = `M${ROUTE_ARROW_POINTS.map(point=>point.join(' ')).join(' ')}Z`;

const platforms = Array.from({length:13},(_,index)=>{
  const vertices=getFootprint(index-1);
  return {
    left:Math.min(...vertices.map(([x])=>x)),right:Math.max(...vertices.map(([x])=>x)),
    top:Math.min(...vertices.map(([,y])=>y)),bottom:Math.max(...vertices.map(([,y])=>y)),
  };
});

export function routeArrow(points, { dash='',cuts=[] } = {}) {
  const [dashLength,gap] = dash.split(' ').map(Number);
  const period = dashLength + gap;
  let best=null, fallback=null;
  for (const { a,b,length,start } of routeRenderGeometry(points).straights) {
    const dx=b.x-a.x,dy=b.y-a.y;
    if (length<14) continue;
    function candidate(distance) {
      if (distance<7||distance>length-7) return null;
      const t=distance/length;
      const x=a.x+dx*t,y=a.y+dy*t;
      if (cuts.some(cut=>x>cut.x-7&&x<cut.x+cut.width+7&&y>cut.y-7&&y<cut.y+cut.height+7)) return null;
      const inside=platforms.some(box=>x>box.left-8&&x<box.right+8&&y>box.top-8&&y<box.bottom+8);
      return { x,y,angle:Math.atan2(dy,dx)*180/Math.PI,score:length-(inside?3000:0)-Math.abs(t-.58)*14,inside };
    }
    for (const t of [.58,.38,.72,.23,.85]) {
      const distance=Math.min(length-7,Math.max(7,length*t));
      const plain=candidate(distance);
      if (plain&&(!fallback||plain.score>fallback.score)) fallback=plain;
      const center=dashLength/2;
      const aligned=period>0 ? candidate(Math.round((start+distance-center)/period)*period+center-start) : plain;
      if (aligned&&(!best||aligned.score>best.score)) best=aligned;
    }
  }
  return !best||best.inside&&!fallback?.inside ? fallback||best : best;
}
