import { z } from "zod";

/** Hive account names are lowercase, 3-16 chars, dot-separated segments. */
export const HiveAccountSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9-.]{2,15}$/, "Invalid Hive account name");

/** Quantities are always decimal strings, never numbers. */
export const QuantitySchema = z.string().regex(/^\d+(\.\d+)?$/, "Quantity must be a decimal string");

export const SymbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9.]{0,19}$/, "Invalid token symbol");

export const TransactionIdSchema = z.string().trim().regex(/^[0-9a-f]{40}$/i, "Invalid transaction id");

export const MetadataSchema = z.record(z.string(), z.unknown()).nullable().optional();


/** Uniform result shape for every Hive chain event. */
export type HiveActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export function ok<T>(data: T): HiveActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: unknown): HiveActionResult<T> {
  const e = error as { message?: string; code?: string };
  const message = e?.message ?? String(error);
  return e?.code ? { ok: false, error: message, code: e.code } : { ok: false, error: message };
}
