export const SERVICE_CONFIG = {
  tickMs: 100,
  leaseMs: 15_000,
  heartbeatMs: 5_000,
  pingInterval: 5_000,
  pingTimeout: 5_000,
  retentionMs: 60_000,
  maxCommands: 32,
} as const;

export function validateServiceConfig(): void {
  if (SERVICE_CONFIG.heartbeatMs * 2 >= SERVICE_CONFIG.leaseMs)
    throw new Error("Authority heartbeat must leave time to recover before lease expiry");
}
