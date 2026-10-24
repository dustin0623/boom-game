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
  /** Configured backend account alias whose key signs (resolved lazily by the SDK). */
  alias: z.string().trim().min(1).default("treasury"),
  to: HiveAccountSchema,
  amount: QuantitySchema,
  symbol: SymbolSchema,
  /** Standardized trigger action carried with the transfer. */
  action: z.string().trim().min(1),
  metadata: MetadataSchema,
  client: z.custom<HiveClient>().optional(),
});

export type TransferTokenInput = z.input<typeof TransferTokenInput>;

export type ServerTransferResult = { transactionId: string | null; layer: 1 | 2 };

/** Server: treasury payout of HIVE/HBD (Layer 1) or a Hive Engine token (Layer 2). */
export async function transferToken(input: TransferTokenInput): Promise<HiveActionResult<ServerTransferResult>> {
  const parsed = TransferTokenInput.safeParse(input);
  if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? "Invalid input"));

  const { alias, to, amount, symbol, action, metadata } = parsed.data;
  const hive = parsed.data.client ?? getHiveClient();
  const layer: 1 | 2 = isNativeSymbol(symbol) ? 1 : 2;

  try {
    const from = hive.account(alias);
    const result =
      layer === 1
        ? await hive.payments.hive.transfer({ from, account: to, amount, symbol, action, metadata: metadata ?? null })
        : await hive.payments.engine.transfer({ from, account: to, quantity: amount, symbol, action, metadata: metadata ?? null });
    return ok({ transactionId: result.transactionId ?? null, layer });
  } catch (error) {
    return fail(error);
  }
}
