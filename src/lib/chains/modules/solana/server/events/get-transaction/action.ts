import { z } from "zod";
import { getSolanaClient, type SolanaClient } from "../../../client";
import {
  SolanaSignatureSchema,
  fromBaseUnits,
  ok,
  fail,
  type SolanaActionResult,
} from "../../../types";

export const GetTransactionInput = z.object({
  signature: SolanaSignatureSchema,
  client: z.custom<SolanaClient>().optional(),
});

export type GetTransactionInput = z.input<typeof GetTransactionInput>;

/** One value movement found inside the transaction. */
export type SolanaTransfer = {
  /** "SOL" or the SPL mint address. */
  symbol: string;
  from: string | null;
  to: string | null;
  amount: string;
  decimals: number;
};

export type SolanaTransactionResult = {
  signature: string;
  slot: number;
  blockTime: number | null;
  /** True only when the transaction landed with no execution error. */
  succeeded: boolean;
  error: string | null;
  /** Fee in SOL, as a decimal string. */
  fee: string;
  /** Signer of the transaction (fee payer). */
  feePayer: string | null;
  memo: string | null;
  transfers: SolanaTransfer[];
};

type ParsedTx = Awaited<ReturnType<SolanaClient["getParsedTransaction"]>>;

/** Turn balance deltas into SOL / SPL transfers, largest credit first. */
function extractTransfers(tx: NonNullable<ParsedTx>): SolanaTransfer[] {
  const transfers: SolanaTransfer[] = [];
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toString());
  const { preBalances = [], postBalances = [], preTokenBalances = [], postTokenBalances = [] } = tx.meta ?? {};

  // Native SOL: pair the biggest debit with each credit.
  const deltas = keys.map((key, i) => ({
    key,
    delta: BigInt(postBalances[i] ?? 0) - BigInt(preBalances[i] ?? 0),
  }));
  const payer = deltas.reduce<{ key: string; delta: bigint } | null>(
    (worst, d) => (d.delta < 0n && (!worst || d.delta < worst.delta) ? d : worst),
    null,
  );
  for (const { key, delta } of deltas) {
    if (delta <= 0n) continue;
    transfers.push({
      symbol: "SOL",
      from: payer?.key ?? null,
      to: key,
      amount: fromBaseUnits(delta, 9),
      decimals: 9,
    });
  }

  // SPL tokens: compare pre/post token balances per owner+mint.
  const amountOf = (rows: typeof preTokenBalances, index: number) =>
    BigInt(rows?.find((r) => r.accountIndex === index)?.uiTokenAmount.amount ?? "0");
  const indexes = new Set([
    ...(preTokenBalances ?? []).map((r) => r.accountIndex),
    ...(postTokenBalances ?? []).map((r) => r.accountIndex),
  ]);
  const tokenDeltas = [...indexes].map((index) => {
    const row =
      postTokenBalances?.find((r) => r.accountIndex === index) ??
      preTokenBalances?.find((r) => r.accountIndex === index);
    return {
      owner: row?.owner ?? keys[index] ?? null,
      mint: row?.mint ?? "",
      decimals: row?.uiTokenAmount.decimals ?? 0,
      delta: amountOf(postTokenBalances, index) - amountOf(preTokenBalances, index),
    };
  });
  for (const credit of tokenDeltas) {
    if (credit.delta <= 0n) continue;
    const debit = tokenDeltas.find((d) => d.mint === credit.mint && d.delta < 0n);
    transfers.push({
      symbol: credit.mint,
      from: debit?.owner ?? null,
      to: credit.owner,
      amount: fromBaseUnits(credit.delta, credit.decimals),
      decimals: credit.decimals,
    });
  }

  return transfers;
}

function extractMemo(tx: NonNullable<ParsedTx>): string | null {
  const instructions = tx.transaction.message.instructions as Array<{
    program?: string;
    parsed?: unknown;
  }>;
  const memo = instructions.find((i) => i.program === "spl-memo");
  if (memo && typeof memo.parsed === "string") return memo.parsed;
  const log = tx.meta?.logMessages?.find((l) => l.includes("Program log: Memo"));
  const match = log?.match(/"(.*)"$/);
  return match?.[1] ?? null;
}

/**
 * Read one mainnet transaction by signature, normalized.
 *
 * `succeeded` only means the transaction executed. Never credit a deposit from
 * this alone — use `validatePayment`, which also checks who paid what.
 */
export async function getTransaction(
  input: GetTransactionInput,
): Promise<SolanaActionResult<SolanaTransactionResult>> {
  const parsed = GetTransactionInput.safeParse(input);
  if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? "Invalid input"));

  const { signature } = parsed.data;
  const solana = parsed.data.client ?? getSolanaClient();

  try {
    const tx = await solana.getParsedTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) return fail(new Error(`Transaction ${signature} not found on Solana mainnet`));

    return ok({
      signature,
      slot: tx.slot,
      blockTime: tx.blockTime ?? null,
      succeeded: !tx.meta?.err,
      error: tx.meta?.err ? JSON.stringify(tx.meta.err) : null,
      fee: fromBaseUnits(tx.meta?.fee ?? 0, 9),
      feePayer: tx.transaction.message.accountKeys[0]?.pubkey.toString() ?? null,
      memo: extractMemo(tx),
      transfers: extractTransfers(tx),
    });
  } catch (error) {
    return fail(error);
  }
}
