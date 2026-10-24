/**
 * Server: treasury payout of SOL or an SPL token, signed with a key read from
 * the environment. Confirm with `validatePayment` before finalizing withdrawals.
 */
import { z } from "zod";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { getSolanaClient, type SolanaClient } from "../../../client";
import { chainEnv } from "@/lib/chains/modules/config";
import { buildTransferTransaction } from "../../../transfer-builder";
import {
  SolanaAddressSchema,
  SolanaSymbolSchema,
  QuantitySchema,
  MetadataSchema,
  ok,
  fail,
  type SolanaActionResult,
} from "../../../types";

export const TransferTokenInput = z.object({
  /** Configured backend account alias. */
  alias: z.string().trim().min(1).default("treasury"),
  to: SolanaAddressSchema,
  amount: QuantitySchema,
  symbol: SolanaSymbolSchema.default("SOL"),
  action: z.string().trim().min(1).optional(),
  metadata: MetadataSchema,
  client: z.custom<SolanaClient>().optional(),
});

export type TransferTokenInput = z.input<typeof TransferTokenInput>;

export type ServerTransferResult = { signature: string; symbol: string; amount: string; from: string; to: string };

/** Load a server signing keypair (JSON byte array or base58) from its environment variable. */
function treasuryKeypair(alias: string): Keypair {
  const keyEnv = alias === "treasury" ? chainEnv.solana.treasurySecretKey : `SOLANA_${alias.toUpperCase()}_SECRET_KEY`;
  const secret = typeof process !== "undefined" ? process.env?.[keyEnv] : undefined;
  if (!secret) throw new Error(`Missing ${keyEnv}. Add the Solana signing key before sending payouts.`);
  const bytes = secret.trim().startsWith("[")
    ? Uint8Array.from(JSON.parse(secret) as number[])
    : bs58.decode(secret.trim());
  return Keypair.fromSecretKey(bytes);
}

export async function transferToken(input: TransferTokenInput): Promise<SolanaActionResult<ServerTransferResult>> {
  const parsed = TransferTokenInput.safeParse(input);
  if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? "Invalid input"));

  const { alias, to, amount, symbol, action, metadata } = parsed.data;
  const solana = parsed.data.client ?? getSolanaClient();

  try {
    const keypair = treasuryKeypair(alias);
    const from = keypair.publicKey.toString();
    const tx = await buildTransferTransaction(solana, { payer: from, to, amount, symbol, action, metadata });
    tx.sign(keypair);
    const signature = await solana.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed" });
    return ok({ signature, symbol, amount, from, to });
  } catch (error) {
    return fail(error);
  }
}
