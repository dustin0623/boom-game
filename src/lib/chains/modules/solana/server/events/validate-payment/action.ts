/**
 * Confirm a Solana mainnet payment before the game credits anything.
 *
 * Checks, in order: the transaction exists, it executed without error, and the
 * recipient really received at least the expected amount of the expected asset.
 * The transaction worker MUST call this before crediting a deposit.
 */
import { z } from "zod";
import { getSolanaClient, type SolanaClient } from "../../../client";
import {
  SolanaAddressSchema,
  SolanaSignatureSchema,
  SolanaSymbolSchema,
  QuantitySchema,
  ok,
  fail,
  type SolanaActionResult,
} from "../../../types";
import { getTransaction, type SolanaTransfer } from "../get-transaction/action";

export const ValidatePaymentInput = z.object({
  signature: SolanaSignatureSchema,
  expected: z
    .object({
      /** Payer address (wallet that sent the funds). */
      from: SolanaAddressSchema.optional(),
      /** Receiving address, normally the game treasury. */
      to: SolanaAddressSchema.optional(),
      /** "SOL" or the SPL mint address. */
      symbol: SolanaSymbolSchema.optional(),
      /** Minimum amount that must have arrived, as a decimal string. */
      amount: QuantitySchema.optional(),
      /** Standardized game action expected in the memo. */
      action: z.string().trim().min(1).optional(),
    })
    .optional(),
  client: z.custom<SolanaClient>().optional(),
});

export type ValidatePaymentInput = z.input<typeof ValidatePaymentInput>;

export type PaymentValidationResult = {
  valid: boolean
  signature: string;
  /** Why the payment was rejected, when invalid. */
  reason: string | null;
  from: string | null;
  to: string | null;
  symbol: string | null;
  amount: string | null;
  memo: string | null;
  slot: number;
  blockTime: number | null;
};

const compare = (a: string, b: string) => Number(a) >= Number(b);

export async function validatePayment(
  input: ValidatePaymentInput,
): Promise<SolanaActionResult<PaymentValidationResult>> {
  const parsed = ValidatePaymentInput.safeParse(input);
  if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? "Invalid input"));

  const { signature, expected } = parsed.data;
  const solana = parsed.data.client ?? getSolanaClient();

  const read = await getTransaction({ signature, client: solana });
  if (!read.ok) return fail(new Error(read.error));

  const tx = read.data;
  const base = {
    signature,
    memo: tx.memo,
    slot: tx.slot,
    blockTime: tx.blockTime,
  };
  const invalid = (reason: string, transfer?: SolanaTransfer) =>
    ok<PaymentValidationResult>({
      ...base,
      valid: false,
      reason,
      from: transfer?.from ?? null,
      to: transfer?.to ?? null,
      symbol: transfer?.symbol ?? null,
      amount: transfer?.amount ?? null,
    });

  if (!tx.succeeded) return invalid(`Transaction failed on chain: ${tx.error ?? "unknown error"}`);

  const symbol = expected?.symbol;
  const candidates = tx.transfers.filter((t) => {
    if (symbol && t.symbol !== symbol) return false;
    if (expected?.to && t.to !== expected.to) return false;
    if (expected?.from && t.from !== expected.from) return false;
    return true;
  });

  if (candidates.length === 0) {
    return invalid("No matching transfer found in this transaction");
  }

  const match =
    (expected?.amount ? candidates.find((t) => compare(t.amount, expected.amount!)) : candidates[0]) ?? null;

  if (!match) {
    const best = candidates[0]!;
    return invalid(`Amount too low: received ${best.amount} ${best.symbol}, expected ${expected?.amount}`, best);
  }

  if (expected?.action) {
    let memoAction: string | null = null;
    try {
      memoAction = tx.memo ? ((JSON.parse(tx.memo) as { action?: string }).action ?? null) : null;
    } catch {
      memoAction = tx.memo;
    }
    if (memoAction !== expected.action) {
      return invalid(`Memo action mismatch: expected "${expected.action}", got "${memoAction ?? "none"}"`, match);
    }
  }

  return ok<PaymentValidationResult>({
    ...base,
    valid: true,
    reason: null,
    from: match.from,
    to: match.to,
    symbol: match.symbol,
    amount: match.amount,
  });
}
