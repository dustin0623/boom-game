"use client";

/**
 * lib/client/solana/deposit.ts
 *
 * Player → treasury Token-2022 deposit, signed IN THE BROWSER.
 *
 * Follows the luckyfrog-farm pattern:
 *   1. POST /api/mint/build-tx  — SERVER builds the unsigned Transaction using
 *      Helius RPC (getLatestBlockhash, ATA checks, etc.) and returns it as a
 *      base64 string.  The Helius key never touches the browser.
 *   2. Client deserialises the transaction, asks the wallet to sign + broadcast
 *      it via solana:signAndSendTransaction.
 *   3. Return the base58 signature as txId for the settlement worker.
 *
 * CLIENT-ONLY.
 */

import { Transaction } from "@solana/web3.js";
import type { Wallet } from "@wallet-standard/base";
import type { DepositParams, DepositResult } from "../types";

interface ConnectFeature {
  connect: () => Promise<{
    accounts: ReadonlyArray<{ address: string; publicKey: Uint8Array }>;
  }>;
}
interface SignAndSendFeature {
  signAndSendTransaction: (
    ...inputs: ReadonlyArray<{
      account: { address: string; publicKey: Uint8Array };
      transaction: Uint8Array;
      chain: string;
    }>
  ) => Promise<ReadonlyArray<{ signature: Uint8Array }>>;
}

export async function sendSolanaDeposit(
  w: Wallet,
  params: DepositParams,
  authToken: string | null,
): Promise<DepositResult> {
  const features = w.features as Record<string, unknown>;
  const connect = features["standard:connect"] as ConnectFeature | undefined;
  const signAndSend = features["solana:signAndSendTransaction"] as
    | SignAndSendFeature
    | undefined;

  if (!connect) throw new Error(`${w.name} does not support connect.`);
  if (!signAndSend) throw new Error(`${w.name} cannot sign and send transactions.`);

  // 1. Connect wallet and get the active account.
  const { accounts } = await connect.connect();
  const account = (accounts[0] ?? w.accounts[0]) as
    | { address: string; publicKey: Uint8Array }
    | undefined;
  if (!account) throw new Error(`${w.name} did not return an account.`);

  // 2. Ask the SERVER to build the unsigned transaction using Helius.
  //    This avoids any browser → Helius calls that get blocked by CORS/auth.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const buildRes = await fetch("/api/mint/build-tx", {
    method: "POST",
    headers,
    body: JSON.stringify({
      playerWallet: account.address,
      qty: params.qty ?? (params.mintCost ? Math.round(params.amount / params.mintCost) : 1),
    }),
  });

  if (!buildRes.ok) {
    const err = await buildRes.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `build-tx failed (${buildRes.status})`);
  }

  const { transaction: txBase64 } = await buildRes.json() as { transaction: string };

  // 3. Deserialise the server-built transaction.
  const txBytes = Uint8Array.from(Buffer.from(txBase64, "base64"));

  // Verify it round-trips cleanly (catches malformed payloads early).
  Transaction.from(txBytes);

  // 4. Have the wallet sign + broadcast it.
  const chain = w.chains.find((c) => c.startsWith("solana:")) ?? "solana:mainnet";
  const [result] = await signAndSend.signAndSendTransaction({
    account,
    transaction: txBytes,
    chain,
  });

  if (!result?.signature) throw new Error(`${w.name} did not return a signature.`);

  const { default: bs58 } = await import("bs58");
  return { txId: bs58.encode(result.signature) };
}
