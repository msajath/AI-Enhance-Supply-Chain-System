// A generation identifies the usable browser session, never a token or credential.
let generation = 0;
let expired = false;
const listeners = new Set<() => void>();
export const sessionGeneration = () => generation;
export function startSession(): void { generation++; expired = false; }
export function endSession(): void { generation++; expired = false; }
export function expireSession(requestGeneration = generation): void {
  if (expired || requestGeneration !== generation) return;
  expired = true;
  generation++;
  for (const listener of listeners) listener();
}
export function onSessionExpired(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
