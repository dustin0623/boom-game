/**
 * lib/chain/solana/transfer.ts
 *
 * Treasury → player SPL-token payout (withdrawal).
 *
 * Pure chain operation: does NOT touch MongoDB. Callers own DB mutations and
 * idempotency. Throws on any failure so the caller can leave state untouched.
 *
 * SERVER-ONLY.
 */

import {
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
  getAccount,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { getConnection, getTreasuryKeypair, getMintPublicKey, getMintDecimals } from "./rpc";
import { buildMemoInstruction, buildWithdrawMemo } from "./memo";

export interface SolanaTransferResult {
  /** Transaction signature (base58) — the Solana equivalent of a tx hash. */
  signature: string;
}

/** Converts a whole-token amount to base units using the mint's decimals. */
function toBaseUnits(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid transfer amount: ${amount}`);
  }
  // Use string math to avoid float precision loss on large amounts.
  const [whole, frac = ""] = String(amount).split(".");
  const paddedFrac = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole + paddedFrac);
}

/**
 * Core payout routine shared by withdrawals and refunds.
 *
 * Steps:
 *   1. Resolve treasury + recipient associated token accounts (ATAs),
 *      creating the recipient ATA if it does not yet exist (treasury pays rent).
 *   2. Preflight the treasury token balance to avoid an on-chain failure.
 *   3. Build a transferChecked instruction + memo instruction.
 *   4. Send and confirm; return the signature.
 */
export async function sendTokens(
  recipientWallet: string,
  amount: number,
  memo: string,
): Promise<SolanaTransferResult> {
  const connection = getConnection();
  const treasury = getTreasuryKeypair();
  const mint = getMintPublicKey();
  const recipient = new PublicKey(recipientWallet);

  // Fetch live decimals from chain — handles any Token-2022 / Pump.fun mint
  // regardless of whether it uses the standard 9 or something else.
  const decimals = await getMintDecimals();
  const rawAmount = toBaseUnits(amount, decimals);

  // Treasury source ATA — must already exist and be funded.
  // TOKEN_2022_PROGRAM_ID is required for Pump.fun mints.
  const treasuryAta = await getOrCreateAssociatedTokenAccount(
    connection,
    treasury,
    mint,
    treasury.publicKey,
    false,
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  // Preflight balance check.
  const treasuryAccount = await getAccount(
    connection,
    treasuryAta.address,
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );
  if (treasuryAccount.amount < rawAmount) {
    throw Object.assign(
      new Error(
        `Treasury token balance insufficient: has ${treasuryAccount.amount}, needs ${rawAmount}`,
      ),
      { code: "TREASURY_INSUFFICIENT" },
    );
  }

  // Recipient ATA — created on demand, treasury pays the rent-exempt deposit.
  const recipientAta = await getOrCreateAssociatedTokenAccount(
    connection,
    treasury,
    mint,
    recipient,
    false,
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const tx = new Transaction().add(
    createTransferCheckedInstruction(
      treasuryAta.address,
      mint,
      recipientAta.address,
      treasury.publicKey,
      rawAmount,
      decimals,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
    buildMemoInstruction(memo),
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [treasury], {
    commitment: "confirmed",
  });

  return { signature };
}

/**
 * Sends `amount` whole tokens from the treasury to `playerWallet` as a
 * withdrawal, tagged with a withdrawal-reference memo.
 */
export async function sendWithdrawal(
  playerWallet: string,
  amount: number,
  ref: string,
): Promise<SolanaTransferResult> {
  return sendTokens(playerWallet, amount, buildWithdrawMemo(ref));
}
