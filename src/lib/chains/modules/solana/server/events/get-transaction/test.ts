import { describe, it, expect } from "vitest";
import { getTransaction } from "./action";
import type { SolanaClient } from "../../../client";

const SIG =
  "5h4nJ1vT7Xq8sV9m2QpZ3rLbYwCdE6fGhJkMnPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLm";
const PAYER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const TREASURY = "3n1vTrEaSuRy4KxWqLmNoPqRsTuVwXyZaBcDeFgHiJkL";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const mock = (tx: unknown) =>
  ({ getParsedTransaction: async () => tx }) as unknown as SolanaClient;

const solTx = {
  slot: 250_000_000,
  blockTime: 1_759_000_000,
  meta: {
    err: null,
    fee: 5000,
    preBalances: [2_000_000_000, 0],
    postBalances: [1_499_995_000, 500_000_000],
    logMessages: ['Program log: Memo (len 9): "buy-sword"'],
    preTokenBalances: [],
    postTokenBalances: [],
  },
  transaction: {
    message: {
      accountKeys: [{ pubkey: { toString: () => PAYER } }, { pubkey: { toString: () => TREASURY } }],
      instructions: [],
    },
  },
};

describe("solana get-transaction", () => {
  it("normalizes a successful SOL transfer", async () => {
    const res = await getTransaction({ signature: SIG, client: mock(solTx) });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ succeeded: true, fee: "0.000005", feePayer: PAYER, memo: "buy-sword" });
    expect(res.data.transfers[0]).toEqual({
      symbol: "SOL",
      from: PAYER,
      to: TREASURY,
      amount: "0.5",
      decimals: 9,
    });
  });

  it("normalizes an SPL token transfer", async () => {
    const splTx = {
      ...solTx,
      meta: {
        ...solTx.meta,
        preBalances: [2_000_000_000, 0],
        postBalances: [1_999_995_000, 0],
        logMessages: [],
        preTokenBalances: [
          { accountIndex: 0, owner: PAYER, mint: MINT, uiTokenAmount: { amount: "10000000", decimals: 6 } },
          { accountIndex: 1, owner: TREASURY, mint: MINT, uiTokenAmount: { amount: "0", decimals: 6 } },
        ],
        postTokenBalances: [
          { accountIndex: 0, owner: PAYER, mint: MINT, uiTokenAmount: { amount: "7500000", decimals: 6 } },
          { accountIndex: 1, owner: TREASURY, mint: MINT, uiTokenAmount: { amount: "2500000", decimals: 6 } },
        ],
      },
    };
    const res = await getTransaction({ signature: SIG, client: mock(splTx) });
    expect(res.ok && res.data.transfers).toEqual([
      { symbol: MINT, from: PAYER, to: TREASURY, amount: "2.5", decimals: 6 },
    ]);
  });

  it("marks a failed transaction as not succeeded", async () => {
    const failed = { ...solTx, meta: { ...solTx.meta, err: { InstructionError: [0, "Custom"] } } };
    const res = await getTransaction({ signature: SIG, client: mock(failed) });
    expect(res.ok && res.data.succeeded).toBe(false);
    expect(res.ok && res.data.error).toContain("InstructionError");
  });

  it("fails when the transaction is not found", async () => {
    const res = await getTransaction({ signature: SIG, client: mock(null) });
    expect(res).toMatchObject({ ok: false });
  });

  it("rejects a malformed signature", async () => {
    const res = await getTransaction({ signature: "short" });
    expect(res.ok).toBe(false);
  });
});
