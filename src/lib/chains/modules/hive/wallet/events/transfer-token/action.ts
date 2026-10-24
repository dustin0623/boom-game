import { z } from "zod";
import { getHiveClient, type HiveClient } from "../../../client";
import {
  HiveAccountSchema,
  SymbolSchema,
  QuantitySchema,
  MetadataSchema,
  ok,
  fail,
  type HiveActionResult,
} from "../../../types";

/** HIVE/HBD are Layer 1 assets; any other symbol rides Hive Engine (Layer 2). */
const isNativeSymbol = (symbol: string) => symbol === "HIVE" || symbol === "HBD";

export const TransferTokenInput = z.object({
  /** The Hive account signing in the browser via Keychain. */
  from: HiveAccountSchema,
  to: HiveAccountSchema,
  amount: QuantitySchema,
  symbol: SymbolSchema,
  /** Standardized trigger action carried with the transfer. */
  action: z.string().trim().min(1),
  metadata: MetadataSchema,
  client: z.custom<HiveClient>().optional(),
});

export type TransferTokenInput = z.input<typeof TransferTokenInput>;

export type WalletTransferResult = { transactionId: string | null; layer: 1 | 2 };

/**
 * Wallet: the player sends HIVE/HBD (Layer 1) or a Hive Engine token (Layer 2)
 * through Keychain. Broadcasting only proves the transfer reached Hive —
 * the server must confirm it with `validatePayment` before crediting.
 */
export async function transferToken(input: TransferTokenInput): Promise<HiveActionResult<WalletTransferResult>> {
  const parsed = TransferTokenInput.safeParse(input);
  if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? "Invalid input"));

  const { from, to, amount, symbol, action, metadata } = parsed.data;
  const hive = parsed.data.client ?? getHiveClient();
  const layer: 1 | 2 = isNativeSymbol(symbol) ? 1 : 2;

  try {
    if (!hive.keychain.isAvailable()) return fail(new Error("Hive Keychain not found. Install the extension."));
    const memo = hive.builder.serialize(hive.builder.buildPayload({ action, metadata: metadata ?? null }));
    const result = await hive.keychain.requestTransfer({ username: from, to, amount, currency: symbol, memo });
    return ok({ transactionId: result.transactionId, layer });
  } catch (error) {
    return fail(error);
  }
}
