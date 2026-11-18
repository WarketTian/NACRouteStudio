export const isOutput = port => port?.kind === 'feed' || port?.kind === 'out';
export const isInput = port => port?.kind === 'in' || port?.kind === 'final';

export function matchingPortDyes(from, to, pipeDye) {
  return from.color === to.color && (pipeDye == null || pipeDye === from.color);
}
