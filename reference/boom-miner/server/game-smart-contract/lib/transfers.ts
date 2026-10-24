/**
 * server/game-smart-contract/lib/transfers.ts
 *
 * Chain-agnostic payout adapter for the withdrawal worker.
 *
 * Reads NEXT_PUBLIC_CHAIN (via lib/config) at startup and delegates to the
 * correct chain-layer implementation. The returned `sendOnChain` function
 * matches the `SendOnChainFn` signature expected by TransactionWorker.
 *
 * SERVER-ONLY.
 */

import { config } from "@/lib/config/config";
import type { SendOnChainFn } from "../workers/transaction-worker";

async function buildSendOnChain(): Promise<SendOnChainFn> {
  const chain = config.blockchain.chain;

  if (chain === "robinhood") {
    const { sendWithdrawal } = await import("@/lib/chain/robinhood/transfer");
    return async (playerWallet, amount, ref) => {
      const result = await sendWithdrawal(playerWallet, amount, ref);
      return { signature: result.txHash };
    };
  }

  if (chain === "hive") {
    const { sendWithdrawal } = await import("@/lib/chain/hive/transfer");
    return async (playerAccount, amount, ref) => {
      const result = await sendWithdrawal(playerAccount, amount, ref);
      return { signature: result.txId };
    };
  }

  // Default: solana
  const { sendWithdrawal } = await import("@/lib/chain/solana/transfer");
  return async (playerWallet, amount, ref) => {
    return sendWithdrawal(playerWallet, amount, ref);
  };
}

export const sendOnChain: SendOnChainFn = await buildSendOnChain();
