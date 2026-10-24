import { describe, it, expect } from "vitest";
import { validatePayment } from "./action";
import type { SolanaClient } from "../../../client";

const SIG =
  "5h4nJ1vT7Xq8sV9m2QpZ3rLbYwCdE6fGhJkMnPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHiJkLm";
const PAYER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const TREASURY = "3n1vTrEaSuRy4KxWqLmNoPqRsTuVwXyZaBcDeFgHiJkL";

const tx = (overrides: { meta?: Record<string, unknown> } = {}) => ({
  slot: 1,
  blockTime: 1_759_000_000,
  meta: {
    err: null,
    fee: 5000,
    preBalances: [2_000_000_000, 0],
    postBalances: [1_499_995_000, 500_000_000],
    logMessages: ['Program log: Memo (len 20): "{"action":"deposit"}"'],
    preTokenBalances: [],
    postTokenBalances: [],
    ...overrides.meta,
  },
  transaction: {
    message: {
      accountKeys: [{ pubkey: { toString: () => PAYER } }, { pubkey: { toString: () => TREASURY } }],
      instructions: [],
    },
  },
});

const mock = (value: unknown) =>
  ({ getParsedTransaction: async () => value }) as unknown as SolanaClient;

describe("solana validate-payment", () => {
  it("accepts a payment matching sender, receiver, asset and amount", async () => {
    const res = await validatePayment({
      signature: SIG,
      expected: { from: PAYER, to: TREASURY, symbol: "SOL", amount: "0.5" },
      client: mock(tx()),
    });
    expect(res.ok && res.data).toMatchObject({ valid: true, amount: "0.5", to: TREASURY, reason: null });
  });

  it("accepts an overpayment", async () => {
    const res = await validatePayment({
      signature: SIG,
      expected: { to: TREASURY, symbol: "SOL", amount: "0.25" },
      client: mock(tx()),
    });
    expect(res.ok && res.data.valid).toBe(true);
  });

  it("rejects an underpayment", async () => {
    const res = await validatePayment({
      signature: SIG,
      expected: { to: TREASURY, symbol: "SOL", amount: "2" },
      client: mock(tx()),
    });
    expect(res.ok && res.data.valid).toBe(false);
    expect(res.ok && res.data.reason).toContain("too low");
  });

  it("rejects a payment sent to another address", async () => {
    const res = await validatePayment({
      signature: SIG,
      expected: { to: PAYER, symbol: "SOL", amount: "0.5" },
      client: mock(tx()),
    });
    expect(res.ok && res.data.reason).toContain("No matching transfer");
  });

  it("rejects a failed transaction", async () => {
    const res = await validatePayment({
      signature: SIG,
      client: mock(tx({ meta: { err: { InstructionError: [0, "Custom"] } } })),
    });
    expect(res.ok && res.data.valid).toBe(false);
    expect(res.ok && res.data.reason).toContain("failed on chain");
  });

  it("checks the memo action when one is expected", async () => {
    const good = await validatePayment({
      signature: SIG,
      expected: { to: TREASURY, symbol: "SOL", amount: "0.5", action: "deposit" },
      client: mock(tx()),
    });
    expect(good.ok && good.data.valid).toBe(true);

    const bad = await validatePayment({
      signature: SIG,
      expected: { to: TREASURY, symbol: "SOL", amount: "0.5", action: "withdraw" },
      client: mock(tx()),
    });
    expect(bad.ok && bad.data.reason).toContain("Memo action mismatch");
  });

  it("fails when the transaction does not exist", async () => {
    const res = await validatePayment({ signature: SIG, client: mock(null) });
    expect(res.ok).toBe(false);
  });
});
