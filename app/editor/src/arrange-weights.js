export const DEFAULT_ARRANGE_WEIGHTS = Object.freeze({ overlap:60, ground:25, bends:15 });

export function normalizeArrangeWeights(weights) {
  return Object.fromEntries(Object.entries(DEFAULT_ARRANGE_WEIGHTS).map(([key,fallback]) => {
    const raw = weights?.[key];
    const value = typeof raw === 'number' || typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
    return [key, Number.isFinite(value) ? Math.max(0,Math.min(100,Math.round(value))) : fallback];
  }));
}
