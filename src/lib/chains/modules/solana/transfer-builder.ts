/**
 * Shared Solana transfer transaction builder (no signing, no secrets).
 * Used by both the wallet transfer event and the server payout event.
 */
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";
import type { SolanaClient } from "./client";
import { toBaseUnits } from "./types";

/** SPL Memo program — carries the game's action tag with the transfer. */
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export type BuildTransferInput = {
  payer: string;
  to: string;
  amount: string;
  /** "SOL" or an SPL mint address. */
  symbol: string;
  action?: string | undefined;
  metadata?: Record<string, unknown> | null | undefined;
};

/** Build an unsigned SOL / SPL transfer (with optional memo) ready for signing. */
export async function buildTransferTransaction(solana: SolanaClient, input: BuildTransferInput): Promise<Transaction> {
  const payer = new PublicKey(input.payer);
  const recipient = new PublicKey(input.to);
  const tx = new Transaction();

  if (input.symbol === "SOL") {
    tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: recipient, lamports: toBaseUnits(input.amount, 9) }));
  } else {
    const mint = new PublicKey(input.symbol);
    const { decimals } = await getMint(solana, mint);
    const source = await getAssociatedTokenAddress(mint, payer);
    const destination = await getAssociatedTokenAddress(mint, recipient);
    if (!(await solana.getAccountInfo(destination))) {
      tx.add(createAssociatedTokenAccountInstruction(payer, destination, recipient, mint));
    }
    tx.add(
      createTransferCheckedInstruction(source, mint, destination, payer, toBaseUnits(input.amount, decimals), decimals),
    );
  }

  if (input.action) {
    tx.add(
      new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(JSON.stringify({ action: input.action, metadata: input.metadata ?? null }), "utf8"),
      }),
    );
  }

  const { blockhash } = await solana.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;
  return tx;
}
