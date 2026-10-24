"use client";

/**
 * lib/client/robinhood/deposit.ts
 *
 * Player → treasury ERC-20 deposit on Robinhood Chain (EVM, chain id 4663),
 * signed IN THE BROWSER by the player's injected (EIP-6963) wallet. Mirror of
 * the server-only payout in lib/chain/robinhood/transfer.ts.
 *
 * ERC-20 `transfer` has no memo field, so the deposit is bound to the pending
 * record by the server-issued `ref` (passed on confirm) plus on-chain checks
 * of sender, recipient, and amount. The tx id is globally single-use server
 * side, so a transfer can never be claimed twice.
 *
 * CLIENT-ONLY.
 */

import { Interface, parseUnits } from "ethers";
import {
  ROBINHOOD_CHAIN_ID_HEX,
  WrongChainError,
  type EIP6963Provider,
} from "@/lib/auth/wallet-adapters/robinhood";
import type { DepositParams, DepositResult } from "../types";

/** Minimal ERC-20 interface — only the transfer selector is needed. */
const ERC20 = new Interface([
  "function transfer(address to, uint256 value) returns (bool)",
]);

function normaliseChainId(raw: string): string {
  return "0x" + parseInt(raw, 16).toString(16);
}

export async function sendRobinhoodDeposit(
  selected: EIP6963Provider,
  params: DepositParams,
): Promise<DepositResult> {
  const { provider } = selected;

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts?.length) throw new Error("No accounts returned from wallet.");
  const from = accounts[0];

  // Guardrail: refuse to broadcast on the wrong network.
  const chainId = (await provider.request({ method: "eth_chainId" })) as string;
  if (normaliseChainId(chainId) !== normaliseChainId(ROBINHOOD_CHAIN_ID_HEX)) {
    throw new WrongChainError();
  }

  const data = ERC20.encodeFunctionData("transfer", [
    params.treasury,
    parseUnits(String(params.amount), params.decimals),
  ]);

  const txHash = (await provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: params.token, data }],
  })) as string;

  return { txId: txHash };
}
