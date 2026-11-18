// GTNH 2.9.0 · GT5U 5.09.54.265, CircuitCalibration and NAC module transforms.
// Chinese descriptions follow the terminology of the Chinese Wiki's NAC calibration table.
const regular = extra => [
  '所有加工模块的配方功率（EU/t）×0.8。',
  '保留一级；与本电路族的校准标记一致的配方，耗时再 ×0.8。',
  `保留前两级；${extra}`,
];

export const CALIBRATION_FAMILIES = Object.freeze({
  primitive:{ name:'原始', thresholds:[40,80,100], effects:[
    '组装矩阵的原始配方有 10% 概率把耗时设为 10 刻（0.5 秒）。',
    '保留一级；另有 5% 概率让本次配方的产出翻倍。',
    '保留一级；产出翻倍的概率提高到 10%。',
  ], note:'概率按配方检查判定。预激活未调谐电路只享受耗时效果。' },
  crystal:{ name:'晶体', thresholds:[30,60,90], effects:regular('超高能蚀刻阵列的激光增益中，EU/t 和耗时的倍率分母各加 1。') },
  wetware:{ name:'湿件', thresholds:[30,60,90], effects:regular('加速生物调谐器的配方输入流体用量减半，向下取整。') },
  bio:{ name:'生物', thresholds:[25,50,75], effects:regular('加速生物调谐器的配方不再消耗输入流体。') },
  optical:{ name:'光学', thresholds:[25,50,75], effects:regular('光学优化组织器的两种净化水增益各再应用一次，对应用水量、耗时和 EU/t 的倍率分别平方。') },
  special:{ name:'特殊', thresholds:[1,5,20], effects:[
    '耗时 ×0.8，EU/t ×5，单次总能耗 ×4。',
    '耗时 ×0.6，EU/t ×2.5，单次总能耗 ×1.5。',
    '耗时 ×0.5，EU/t ×2，单次总能耗 ×1。',
  ], note:'仅作用于特殊路线配方；倍率按校准本身计算。' },
});

export const calibrationFamily = value => {
  const id=value==='bioware'?'bio':value;
  return Object.hasOwn(CALIBRATION_FAMILIES,id)?id:'';
};

export const calibrationLevel = value => value!==null&&typeof value==='object'?value.level:value;

export function calibrationSelection(value,target,dataset) {
  const selected=calibrationFamily(value?.family||value?.type);
  const known=calibrationFamily(target?.calibration);
  const output=target?.component||target?.id;
  // Some optical targets have a finishing recipe without a family marker before their assembly recipe.
  const recipe=!selected&&!known&&output?dataset.recipes.find(recipe=>recipe.module!=='conversion'
    &&calibrationFamily(recipe.calibration)&&recipe.outputs?.some(entry=>entry?.item===output)):null;
  return {selected,family:selected||known||calibrationFamily(recipe?.calibration),level:Number(calibrationLevel(value))||0};
}
