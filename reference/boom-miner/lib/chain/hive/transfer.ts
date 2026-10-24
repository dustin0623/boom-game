/**
 * lib/chain/hive/transfer.ts
 *
 * Treasury → player Hive-Engine token payout (withdrawal).
 *
 * Hive-Engine tokens (BMCOIN, SCRAP, etc.) are layer-2 assets — they are NOT
 * native HIVE/HBD and CANNOT be sent with client.broadcast.transfer(). Instead
 * we broadcast a `custom_json` operation with id = `ssc-mainnet-hive` carrying
 * a Hive-Engine `tokens.transfer` payload. dhive's `client.broadcast.json()`
 * does exactly this.
 *
 * Pure chain operation: does NOT touch MongoDB. Callers own DB mutations and
 * idempotency. Throws on any failure so the caller can leave state untouched.
 *
 * SERVER-ONLY.
 */

import {
  makeHiveClient,
  getTreasuryAccount,
  getTreasuryActiveKey,
  getTokenSymbol,
  getEngineBalance,
  getTokenPrecision,
  ENGINE_ID,
} from "./rpc";
import { buildWithdrawMemo } from "./memo";

export interface HiveTransferResult {
  /** Hive consensus-layer transaction id carrying the custom_json op. */
  txId: string;
}

/** Formats an amount to the token's fixed precision (Hive-Engine requires a string). */
function formatQuantity(amount: number, precision: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Invalid transfer amount: ${amount}`);
  }
  return amount.toFixed(precision);
}

/**
 * Core payout routine shared by withdrawals and refunds.
 *
 * Steps:
 *   1. Preflight the treasury token balance via the Hive-Engine contracts API.
 *   2. Broadcast a Hive-Engine `tokens.transfer` custom_json op with memo.
 *   3. Return the Hive consensus-layer tx id.
 *
 * WHY custom_json and not client.broadcast.transfer():
 *   HIVE-Engine tokens are layer-2 assets. The native transfer op only works
 *   for HIVE and HBD. For any other token (BMCOIN, SCRAP, etc.) you MUST use
 *   a custom_json op with id = ENGINE_ID and a tokens.transfer payload.
 */
export async function sendTokens(
  recipientAccount: string,
  amount: number,
  memo: string,
): Promise<HiveTransferResult> {
  // makeHiveClient() fetches fresh beacon nodes on every payout so the
  // broadcast always goes to the highest-scoring live nodes.
  const client    = await makeHiveClient();
  const treasury  = getTreasuryAccount();
  const symbol    = getTokenSymbol();
  const precision = await getTokenPrecision(symbol);
  const to        = recipientAccount.trim().toLowerCase();
  const quantity  = formatQuantity(amount, precision);

  // Preflight balance check.
  const balance = await getEngineBalance(treasury, symbol);
  if (balance < amount) {
    throw Object.assign(
      new Error(`Treasury token balance insufficient: has ${balance} ${symbol}, needs ${amount}`),
      { code: "TREASURY_INSUFFICIENT" },
    );
  }

  // Broadcast a Hive-Engine tokens.transfer via custom_json.
  // This is the ONLY correct way to move layer-2 tokens on Hive-Engine.
  const result = await client.broadcast.json(
    {
      id:                   ENGINE_ID,
      json:                 JSON.stringify({
        contractName:   "tokens",
        contractAction: "transfer",
        contractPayload: {
          symbol:   symbol.toUpperCase(),
          to,
          quantity,
          memo,
        },
      }),
      required_auths:         [treasury],
      required_posting_auths: [],
    },
    getTreasuryActiveKey(),
  );

  return { txId: result.id };
}

/**
 * Sends `amount` whole tokens from the treasury to `playerAccount` as a
 * withdrawal, tagged with a withdrawal-reference memo.
 */
export async function sendWithdrawal(
  playerAccount: string,
  amount: number,
  ref: string,
): Promise<HiveTransferResult> {
  return sendTokens(playerAccount, amount, buildWithdrawMemo(ref));
}
