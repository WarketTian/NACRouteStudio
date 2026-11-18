import { CELL_SIZE, GRID_SIZE, getPlatform } from './diagram.js';
import { selectedRecipeFor } from './module-recipes.js';
import { DISPLAY_SLOTS } from './project.js';

const sides = ['top','top','right','right','bottom','bottom','bottom','bottom','left','left','top','top'];
const recipeItems = (...lists) => lists.flatMap(list=>Array.isArray(list) ? list.flatMap(entry=>
  typeof entry?.item==='string' ? [entry.item] : []) : []);

function catalogIndex(dataset) {
  const items=new Map((dataset.items || []).map(item=>[item.id,item]));
  const recipes=new Map((dataset.recipes || []).map(recipe=>[recipe.id,recipe]));
  const isFluid=id=>typeof id==='string' && (items.get(id)?.kind==='fluid' || id.startsWith('fluid:'));
  const canonical=id=>items.get(id)?.component || id;
  return {recipes,isFluid,canonical};
}

function readSelectedFluids(module,{recipes,isFluid,canonical}) {
  const selections=module?.config?.recipeSelections;
  if (!selections || typeof selections!=='object' || Array.isArray(selections)) return [];
  const result=new Map();
  for (const id of new Set(Object.values(selections))) {
    const recipe=recipes.get(id);
    if (!recipe || recipe.module!==module.type) continue;
    const outputs=recipeItems(recipe.outputs,recipe.alternateOutputs);
    if (!outputs.some(item=>!isFluid(item)
        && selectedRecipeFor(module,canonical(item))===id)) continue;
    for (const item of recipeItems(recipe.inputs,recipe.fluids)) {
      if (!isFluid(item)) continue;
      if (!result.has(item)) result.set(item,new Set());
      result.get(item).add(id);
    }
  }
  return [...result].map(([item,recipeIds])=>({item,recipeIds:[...recipeIds]}));
}

export function selectedModuleFluids(module,dataset) {
  return readSelectedFluids(module,catalogIndex(dataset));
}

function badgeRow(box,side,fluids,depth) {
  // With an even count the center falls between cells, so use the nearer left/top alignment.
  const offset=Math.floor((GRID_SIZE-fluids.length)/2)*CELL_SIZE;
  const outward=depth*CELL_SIZE;
  return fluids.map((fluid,index)=>{
    const along=offset+index*CELL_SIZE;
    const positions={
      top:[box.x+along,box.y-outward-CELL_SIZE],
      right:[box.x+box.width+outward,box.y+along],
      bottom:[box.x+along,box.y+box.height+outward],
      left:[box.x-outward-CELL_SIZE,box.y+along],
    };
    const [x,y]=positions[side];
    return {...fluid,x,y,width:CELL_SIZE,height:CELL_SIZE};
  });
}

export function layoutModuleFluidBadges(project,dataset) {
  const index=catalogIndex(dataset);
  const badges=[];
  let bounds=null;
  DISPLAY_SLOTS.forEach((slot,displayIndex)=>{
    const fluids=readSelectedFluids(project.modules[slot],index);
    if (!fluids.length) return;
    const box=getPlatform(slot);
    const side=sides[displayIndex];
    for (let start=0;start<fluids.length;start+=GRID_SIZE) {
      for (const badge of badgeRow(box,side,fluids.slice(start,start+GRID_SIZE),start/GRID_SIZE)) {
        badges.push({...badge,slot,side});
        const {x,y,width,height}=badge;
        bounds=bounds ? {
          left:Math.min(bounds.left,x),top:Math.min(bounds.top,y),
          right:Math.max(bounds.right,x+width),bottom:Math.max(bounds.bottom,y+height),
        } : {left:x,top:y,right:x+width,bottom:y+height};
      }
    }
  });
  return {badges,bounds};
}
