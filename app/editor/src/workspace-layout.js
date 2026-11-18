export const dockLimits = { left:[112,380], right:[198,480] };
const canvasMinimum = 270;
const collapsedWidth = 36;
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

export function dockMaximum(side,viewport,other) {
  const [minimum,maximum]=dockLimits[side];
  return clamp(viewport-canvasMinimum-other,minimum,maximum);
}

export function clampDockWidth(side,value,viewport,other) {
  return Math.round(clamp(value,dockLimits[side][0],dockMaximum(side,viewport,other)));
}

export function workspaceDocks(viewport,leftPreference,rightPreference,rightCollapsed) {
  const left=clampDockWidth('left',leftPreference,viewport,rightCollapsed?collapsedWidth:dockLimits.right[0]);
  const right=rightCollapsed?collapsedWidth:clampDockWidth('right',rightPreference,viewport,left);
  return {left,right};
}

export function adjacentWindowPosition(anchor,panel,viewport) {
  const margin=8;
  const gap=10;
  const middleX=(anchor.left+anchor.right-panel.width)/2;
  const middleY=(anchor.top+anchor.bottom-panel.height)/2;
  const sides=[
    {x:anchor.right+gap,y:middleY,room:viewport.width-anchor.right-gap-margin,size:panel.width},
    {x:anchor.left-gap-panel.width,y:middleY,room:anchor.left-gap-margin,size:panel.width},
  ].sort((a,b)=>b.room-a.room);
  const vertical=[
    {x:middleX,y:anchor.bottom+gap,room:viewport.height-anchor.bottom-gap-margin,size:panel.height},
    {x:middleX,y:anchor.top-gap-panel.height,room:anchor.top-gap-margin,size:panel.height},
  ].sort((a,b)=>b.room-a.room);
  const candidates=[...sides,...vertical];
  const position=candidates.find(entry=>entry.room>=entry.size)
    || candidates.reduce((best,entry)=>entry.room/entry.size>best.room/best.size?entry:best);
  return {
    x:Math.round(clamp(position.x,margin,viewport.width-panel.width-margin)),
    y:Math.round(clamp(position.y,margin,viewport.height-panel.height-margin)),
  };
}
