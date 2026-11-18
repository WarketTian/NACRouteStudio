// GT5-Unofficial 5.09.54.265, MTEOpticalOrganizerModule.WATER_LIST.
const opticalWaters = new Map([
  [3, {tier:3, perSecond:1000, effect:'water', multiplier:0.8}],
  [4, {tier:4, perSecond:800, effect:'water', multiplier:0.6}],
  [5, {tier:5, perSecond:800, effect:'ticks', multiplier:0.9}],
  [6, {tier:6, perSecond:600, effect:'ticks', multiplier:0.7}],
  [7, {tier:7, perSecond:600, effect:'eu', multiplier:0.9}],
  [8, {tier:8, perSecond:400, effect:'eu', multiplier:0.7}],
]);

export const opticalWaterBoost = tier => opticalWaters.get(Number(tier));

export function opticalWaterTiers(module) {
  const tiers=module.config?.waterTiers||module.waterTiers;
  return Array.isArray(tiers)?tiers:[module.waterTier,null];
}

export function opticalWaterEffects(tiers,calibration) {
  const boosts=tiers.map(opticalWaterBoost).filter(Boolean);
  if (boosts.length!==2||boosts[0].tier===boosts[1].tier) return null;
  const doubled=calibration.family==='optical'&&calibration.level===3;
  const multipliers={water:1,ticks:1,eu:1};
  let runningWaterMultiplier=1;
  for (const {effect,multiplier} of doubled?[...boosts,...boosts]:boosts) {
    multipliers[effect]*=multiplier;
    // The running fluid drain casts the Java float product to a whole number of litres.
    if (effect==='water') runningWaterMultiplier=Math.fround(runningWaterMultiplier*Math.fround(multiplier));
  }
  const runningRates=boosts.map(({perSecond})=>Math.floor(Math.fround(perSecond*runningWaterMultiplier)));
  return {doubled,multipliers,runningRates};
}

export const assemblyPowerMultiplier = (tier,required) => 0.95**(tier-required);

export function immersionDurationMultiplier(impurity) {
  const ratio=impurity/100;
  if (ratio<=0.15) return 0.7+ratio*2;
  if (ratio>=0.65) return 1+2*(ratio-0.65);
  return 1;
}

export function etchingDivisors(tier,amps,calibration) {
  const bonus=calibration.family==='crystal'&&calibration.level===3?1:0;
  const eu=Math.max(1,Math.ceil(Math.log(amps)/Math.log(4))-3+bonus);
  const ticks=Math.max(1,tier-9+bonus);
  return {eu,ticks,bonus};
}

export function biologicalFluidMultiplier(calibration) {
  if (calibration.level!==3) return 1;
  if (calibration.family==='bio') return 0;
  if (calibration.family==='wetware') return 0.5;
  return 1;
}
