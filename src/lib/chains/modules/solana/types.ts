import { z } from "zod";

/** Base58 ed25519 public key (32 bytes → 32-44 chars). */
export const SolanaAddressSchema = z
  .string()
  .trim()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address");

/** Base58 transaction signature (64 bytes → 86-88 chars). */
export const SolanaSignatureSchema = z
  .string()
  .trim()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/, "Invalid Solana transaction signature");

/** SOL, or an SPL mint address. */
export const SolanaSymbolSchema = z.union([z.literal("SOL"), SolanaAddressSchema]);

/** Quantities are always decimal strings, never floats. */
export const QuantitySchema = z.string().regex(/^\d+(\.\d+)?$/, "Quantity must be a decimal string");

export const MetadataSchema = z.record(z.string(), z.unknown()).nullable().optional();


/** Native SOL has 9 decimals (1 SOL = 1_000_000_000 lamports). */
export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Uniform result shape for every Solana chain event. */
export type SolanaActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export function ok<T>(data: T): SolanaActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: unknown): SolanaActionResult<T> {
  const e = error as { message?: string; code?: string };
  const message = e?.message ?? String(error);
  return e?.code ? { ok: false, error: message, code: e.code } : { ok: false, error: message };
}

/** Convert an integer base-unit amount to a decimal string. */
export function fromBaseUnits(amount: bigint | number | string, decimals: number): string {
  const raw = BigInt(amount);
  if (decimals === 0) return raw.toString();
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, -decimals);
  const frac = digits.slice(-decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Convert a decimal string to an integer base-unit amount. */
export function toBaseUnits(amount: string, decimals: number): bigint {
  const [whole = "0", frac = ""] = amount.split(".");
  if (frac.length > decimals) throw new Error(`Amount has more than ${decimals} decimal places`);
  return BigInt(`${whole}${frac.padEnd(decimals, "0")}` || "0");
}
