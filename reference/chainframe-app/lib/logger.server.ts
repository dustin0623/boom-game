/**
 * lib/logger.server.ts
 *
 * Minimal timestamped logger for the settlement worker.
 * Dependency-free. Never logs treasury secrets.
 */

const TAG = `[${"HIVE"} Worker]`;

function ts(): string {
  return new Date().toISOString();
}

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    const sensitive = /key|secret|private/i.test(key);
    out[key] = sensitive ? "***" : value;
  }
  return out;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(`${ts()} ${TAG} ${message}`, meta ? redact(meta) : "");
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`${ts()} ${TAG} ${message}`, meta ? redact(meta) : "");
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`${ts()} ${TAG} ${message}`, meta ? redact(meta) : "");
  },
};
