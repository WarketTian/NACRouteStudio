import { VOLTAGES } from './engine.js';

const recipeLimits = {
  conversion:[1,1,0,0],
  assembly:[16,1,4,0],
  parts:[6,4,3,0],
  board:[1,1,1,1],
  etching:[2,2,2,0],
  cutting:[1,1,1,0],
  wire:[2,4,0,0],
  superconductor:[1,1,0,0],
  optical:[1,1,0,0],
  encasing:[4,1,2,0],
  bio:[1,1,1,0],
};

const plateWidth = 176;
const tileSize = 18;
const list = entries => Array.isArray(entries) ? entries.filter(entry=>typeof entry?.item==='string'&&entry.item) : [];

export function normalizedInputs(recipe) {
  return [...list(recipe?.inputs),...list(recipe?.fluids)];
}

function grid(count,x,y,columns) {
  return Array.from({length:count},(_,index)=>[
    x+index%columns*tileSize,y+Math.floor(index/columns)*tileSize,
  ]);
}

function solids(count,output=false) {
  const columns = count<=2 ? count : count===4 ? 2 : 3;
  const x = output ? 106 : 70-columns*tileSize;
  const y = count<=3 ? 24 : count<=6 ? 15 : 6;
  return grid(count,x,y,columns);
}

function fluidGroup(count,output,y) {
  return grid(count,output ? 106 : Math.max(70-count*tileSize,16),y,3);
}

// Positions and empty slot counts follow RecipeMaps, UIHelper and NACMatrixFrontend in GT5U 5.09.54.265.
function layoutRecipe(recipe,entries) {
  const limits = recipeLimits[recipe.module] || [];
  const counts = entries.map((group,index)=>Math.max(group.length,limits[index]||0));
  const [itemIn,itemOut,fluidIn,fluidOut]=counts;
  const alternateCount=list(recipe.alternateOutputs).length;
  if (recipe.module==='generated') {
    const solidRows=Math.max(1,Math.ceil(itemIn/6),Math.ceil(itemOut/3));
    const fluidY=15+solidRows*tileSize+10;
    return {
      width:228,
      positions:[grid(itemIn,12,15,6),grid(itemOut,160,15,3),grid(fluidIn,12,fluidY,6),grid(fluidOut,160,fluidY,3)],
      alternatePositions:[],
      bars:[['arrow',130,15+(solidRows-1)*tileSize/2,20,18]],
    };
  }
  if (recipe.module==='assembly' && itemIn<=16 && itemOut===1 && fluidIn<=4 && !fluidOut && alternateCount<=1) {
    return {
      matrix:true,
      positions:[grid(itemIn,16,8,4),grid(itemOut,142,8,1),grid(fluidIn,106,8,1),[]],
      alternatePositions:grid(alternateCount,142,26,1),
    };
  }
  const inputPositions=solids(itemIn);
  const allOutputs=solids(itemOut+alternateCount,true);
  const outputPositions=allOutputs.slice(0,itemOut);
  const alternatePositions=allOutputs.slice(itemOut);
  const y=Math.max(62,...[...inputPositions,...outputPositions,...alternatePositions].map(point=>point[1]+tileSize+3));
  return {
    matrix:false,
    positions:[inputPositions,outputPositions,fluidGroup(fluidIn,false,y),fluidGroup(fluidOut,true,y)],
    alternatePositions,
  };
}

function position(x,y,width,height,plateHeight,canvasWidth=plateWidth) {
  return `--slot-x:${x/canvasWidth*100}%;--slot-y:${y/plateHeight*100}%;--slot-w:${width/canvasWidth*100}%;--slot-h:${height/plateHeight*100}%`;
}

const groupNames=['固体输入','固体输出','流体输入','流体输出'];
const progressBars = {
  matrix:[
    ['assembly-one',88,8,17,72],
    ['assembly-two',124,8,18,72],
    ['assembly-up',146,26,10,18],
  ],
  standard:[['arrow',78,24,20,18]],
};

// GT5U RecipeMapFrontend draws energy, duration and recipe metadata in this order.
const voltageEntries = Object.entries(VOLTAGES);

function recipeStatistics(recipe, fmt) {
  const eu=Number(recipe.eu);
  const ticks=Number(recipe.ticks);
  const powerTier=voltageEntries.findIndex(([,voltage])=>eu<=voltage);
  const casing=recipe.casingTier;
  const casingTier=typeof casing==='string'&&!/^\d+$/.test(casing)
    ? voltageEntries.findIndex(([tier])=>tier.toUpperCase()===casing.toUpperCase()) : Number(casing);
  const tierLabel=index=>voltageEntries[index]
    ? `<span class="voltage-label nei-tier${index>=8?' nei-tier-high':''}" data-voltage="${voltageEntries[index][0]}">${voltageEntries[index][0]}</span>` : '';
  const row=(label,value)=>`<div><dt>${label}：</dt><dd>${value}</dd></div>`;
  const rows=[];
  if (eu>0&&ticks>0) rows.push(row('总计',`${fmt(eu*ticks)} EU`));
  if (eu>0) {
    const powerLabel=tierLabel(powerTier);
    rows.push(row('使用',`${fmt(eu)} EU/t${powerLabel?` (${powerLabel})`:''}`));
  }
  if (ticks>0) rows.push(row('时间',ticks>20?`${fmt(ticks/20)} 秒`:`${fmt(ticks)} 刻`));
  const casingLabel=recipe.module==='assembly'&&casing!=null?tierLabel(casingTier):'';
  if (casingLabel) rows.push(row('机械方块等级',casingLabel));
  return rows.length?`<dl class="nei-statistics">${rows.join('')}</dl>`:'';
}

export function renderRecipeCard(recipe, { items, itemName, moduleName, esc, asset, fmt, itemIcon=item=>item?.icon }) {
  if (!recipe) return '<p class="muted empty-line">选择一条配方查看配方槽位和用电。</p>';
  const isFluid=entry=>items.get(entry.item)?.kind==='fluid'||entry.item.startsWith('fluid:');
  const inputs=normalizedInputs(recipe);
  const outputs=[...list(recipe.outputs),...list(recipe.fluidOutputs)];
  const alternate=list(recipe.alternateOutputs);
  const entries=[inputs.filter(entry=>!isFluid(entry)),outputs.filter(entry=>!isFluid(entry)),inputs.filter(isFluid),outputs.filter(isFluid)];
  const layout=layoutRecipe(recipe,entries);
  const canvasWidth=layout.width||plateWidth;
  const tileWidth=tileSize/canvasWidth*100;
  const generated=recipe.module==='generated';
  const plateHeight=Math.max(88,...layout.positions.flat().concat(layout.alternatePositions).map(point=>point[1]+tileSize+8));
  const exclusiveChance = alternate.length && alternate.every(entry=>Number.isFinite(entry.chance))
    ? Math.max(0,1-alternate.reduce((total,entry)=>total+entry.chance,0)) : null;

  function slot(entry,point,index,chance=entry?.chance) {
    const fluid=index>=2;
    const style=position(...point,tileSize,tileSize,plateHeight,canvasWidth);
    const classes=`nei-slot ${fluid?'nei-slot-fluid':'nei-slot-item'}`;
    if (!entry) return `<span class="${classes}" style="${style}" aria-hidden="true"></span>`;
    const item=items.get(entry.item);
    const name=itemName(entry.item);
    const unit=fluid?' L':'';
    const count=entry.continuous?'∞':`${fmt(entry.amount)}${unit}`;
    const countSize=Math.min(tileWidth*.235,(tileWidth*.84)/(.59*count.length));
    const details=[entry.continuous?'持续流转（无单次定量）':`${groupNames[index]} · ${count}`];
    if (entry.renamed) details.push('改名标记');
    if (Number.isFinite(chance)) details.push(`产出概率 ${fmt(chance*100)}%`);
    for (const alternative of list(entry.alternatives)) {
      details.push(`可替代 · ${itemName(alternative.item)} × ${fmt(alternative.amount)}`);
    }
    return `<button type="button" class="${classes}" style="${style}" draggable="true" data-item-id="${esc(entry.item)}" data-recipe-link="${esc(entry.item)}" ${entry.renamed?'data-renamed="true"':''} data-tip-item="${esc(entry.item)}" data-tip-details="${esc(details.join('\n'))}" aria-label="${esc([name,...details].join('，'))}">${asset(itemIcon(item),'pixel') || `<span class="nei-missing-icon">${fluid?'◆':'⬡'}</span>`}
      ${entry.continuous||entry.amount!=null?`<span class="nei-amount" style="--nei-count-size:${countSize}cqw">${esc(count)}</span>`:''}${Number.isFinite(chance)?`<span class="nei-chance">${fmt(chance*100)}%</span>`:''}${entry.renamed?'<span class="nei-renamed" aria-hidden="true">★</span>':''}</button>`;
  }

  const bars=(layout.bars||progressBars[layout.matrix?'matrix':'standard']).map(([kind,x,y,w,h])=>
    `<span class="nei-progress nei-${kind}" style="${position(x,y,w,h,plateHeight,canvasWidth)}" aria-hidden="true"></span>`).join('');
  const slots=layout.positions.map((group,index)=>group.map((point,slotIndex)=>
    slot(entries[index][slotIndex],point,index,index===1&&slotIndex===0&&exclusiveChance!=null?exclusiveChance:undefined)).join('')).join('');
  const alternateSlots=layout.alternatePositions.map((point,index)=>slot(alternate[index],point,1)).join('');
  const title=generated?(recipe.id==='generated:all'?'全部目标汇总':'目标投料配方')
    :recipe.module==='conversion'?'纳米芯片组件转换':moduleName(recipe.module);
  return `<article class="nei-sheet${generated?' nei-generated':''}" aria-label="NEI 配方">
    <h3 class="nei-sheet-title">${esc(title)}</h3>
    <div class="nei-plate" style="--plate-ratio:${canvasWidth}/${plateHeight}">
      <span class="nei-backplate" aria-hidden="true"></span>${bars}${slots}${alternateSlots}
      ${generated?'':`<span class="nei-gt-logo" style="${position(152,63,17,17,plateHeight)}" aria-hidden="true"></span>`}
    </div>
    ${generated?'':recipeStatistics(recipe,fmt)}
  </article>`;
}
