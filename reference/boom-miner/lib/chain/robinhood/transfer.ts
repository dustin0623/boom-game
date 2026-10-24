/**
 * lib/chain/robinhood/transfer.ts
 *
 * Treasury → player ERC-20 payout (withdrawal) on Robinhood Chain.
 *
 * Pure chain operation: does NOT touch MongoDB. Callers own DB mutations and
 * idempotency. Throws on any failure so the caller can leave state untouched.
 *
 * SERVER-ONLY.
 */

import { parseUnits, formatUnits } from "ethers";
import { getTreasuryWallet, getTokenContract, getTokenDecimals, resetProvider } from "./rpc";
import { buildWithdrawMemo, encodeMemoHex } from "./memo";

export interface RobinhoodTransferResult {
  /** Transaction hash of the token transfer. */
  txHash: string;
  /** Optional hash of the companion on-chain memo tx (when broadcast). */
  memoTxHash?: string;
}

/**
 * Core payout routine shared by withdrawals and refunds.
 *
 * Steps:
 *   1. Preflight the treasury token balance to avoid an on-chain revert.
 *   2. Broadcast the ERC-20 transfer and wait for a 1-confirmation receipt.
 *   3. Optionally broadcast a 0-value memo tx so the reference is on-chain.
 */
export async function sendTokens(
  recipientWallet: string,
  amount: number,
  memo: string,
): Promise<RobinhoodTransferResult> {
  const token = getTokenContract();
  const treasury = getTreasuryWallet();
  const decimals = await getTokenDecimals();
  const rawAmount = parseUnits(String(amount), decimals);

  // Preflight balance check.
  let treasuryBalance: bigint;
  try {
    treasuryBalance = await token.balanceOf(treasury.address);
  } catch (err) {
    resetProvider();
    throw err;
  }
  if (treasuryBalance < rawAmount) {
    throw Object.assign(
      new Error(
        `Treasury balance insufficient: has ${formatUnits(treasuryBalance, decimals)}, needs ${amount}`,
      ),
      { code: "TREASURY_INSUFFICIENT" },
    );
  }

  // Broadcast the ERC-20 transfer.
  // Explicit gasLimit eliminates the gas-estimation RPC call, preventing a
  // timeout on a loaded node from dead-lettering a valid withdrawal.
  let tx: Awaited<ReturnType<typeof token.transfer>>;
  try {
    tx = await token.transfer(recipientWallet, rawAmount, {
      gasLimit: 100_000n, // safe ceiling for an ERC-20 transfer (~65k typical)
    });
  } catch (err) {
    resetProvider();
    throw err;
  }
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status !== 1) {
    throw Object.assign(new Error(`Transfer reverted: ${tx.hash}`), {
      code: "TX_REVERTED",
      txHash: tx.hash,
    });
  }

  const result: RobinhoodTransferResult = { txHash: receipt.hash };

  // Optional on-chain memo: a 0-value self-describing tx carrying the ref.
  // Best-effort — failure here must not undo a completed payout.
  try {
    const memoTx = await treasury.sendTransaction({
      to: recipientWallet,
      value: 0n,
      data: encodeMemoHex(memo),
      gasLimit: 50_000n, // safe ceiling for a data-carrying 0-value tx (~21k typical)
    });
    const memoReceipt = await memoTx.wait(1);
    if (memoReceipt?.hash) result.memoTxHash = memoReceipt.hash;
  } catch {
    // Memo is non-critical; the canonical memo is also stored off-chain.
  }

  return result;
}

/**
 * Sends `amount` whole tokens from the treasury to `playerWallet` as a
 * withdrawal, tagged with a withdrawal-reference memo.
 */
export async function sendWithdrawal(
  playerWallet: string,
  amount: number,
  ref: string,
): Promise<RobinhoodTransferResult> {
  return sendTokens(playerWallet, amount, buildWithdrawMemo(ref));
}
