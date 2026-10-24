import { AsyncLocalStorage } from "node:async_hooks";

const context = new AsyncLocalStorage<{
  time: number;
  seed: string;
  correlationKey?: string;
  logged?: boolean;
  checkLease?: () => Promise<void>;
}>();
export const gameActionNow = () => context.getStore()?.time ?? Date.now();
export const gameActionSeed = () => context.getStore()?.seed;
export const gameActionHasLog = () => context.getStore()?.logged ?? false;
export function markGameActionLog(): void {
  const current = context.getStore();
  if (current) current.logged = true;
}
export const gameActionCorrelationKey = () =>
  context.getStore()?.correlationKey;
export async function checkGameExecution(): Promise<void> {
  await context.getStore()?.checkLease?.();
}
export function withGameExecution<T>(
  time: number,
  seed: string,
  execute: () => Promise<T>,
  correlationKey?: string,
  checkLease?: () => Promise<void>,
): Promise<T> {
  return context.run({ time, seed, correlationKey, checkLease }, execute);
}
