import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IInboundTransaction } from "@/lib/modules/transactions-pending/server.types";
const m = await vi.hoisted(async () => {
  const { createTreasuryReadStubs } = await import("@/tests/fixtures/treasury-reads");
  return { ...createTreasuryReadStubs(), state: vi.fn(), dispatch: vi.fn() };
});
vi.mock("@/lib/config/config", () => ({
  config: {
    blockchain: {
      treasuryAccount: "treasury",
      token: "HASH",
      tokenPrecision: 3,
    },
  },
}));
vi.mock(
  "@/lib/chains/modules/hive/server/events/get-token-state/action",
  () => ({ getTokenState: m.state }),
);
vi.mock("@/lib/modules/transactions-pending/server.repository", () => ({
  getPendingTreasuryTransfer: m.pending,
}));
vi.mock("@/lib/modules/transactions-processed/server.repository", () => ({
  getArchivedTreasuryTransfer: m.archived,
}));
vi.mock("./dispatch", () => ({ dispatchTreasuryTransfer: m.dispatch }));
import { dispatchWithdrawalPayout } from "./withdrawal-payout";
const context = { checkLease: vi.fn(async () => {}), maxRetries: 8 };
const job = {
  signature: "withdrawal:origin",
  walletAddress: "alice",
  withdrawAmount: 10,
  withdrawalPayoutPolicyVersion: 1,
} as IInboundTransaction;
const token = {
  balance: "0",
  precision: 3,
  issuer: "treasury",
  supply: "20.000",
  maxSupply: "100.000",
};
beforeEach(() => {
  vi.resetAllMocks();
  m.state.mockResolvedValue(token);
  m.dispatch.mockResolvedValue({
    status: "confirmed",
    success: true,
    transactionId: "payout",
  });
});
describe("withdrawal payout policy", () => {
  it.each([
    ["10.001", "transfer"],
    ["10.000", "transfer"],
    ["3.000", "issue"],
    ["0", "issue"],
  ])("selects a full-amount %s payout: %s", async (balance, operation) => {
    m.state.mockResolvedValue({ ...token, balance });
    await dispatchWithdrawalPayout(context, job);
    expect(m.dispatch).toHaveBeenCalledExactlyOnceWith(
      context,
      job.signature,
      `processWithdrawal:${job.signature}`,
      "alice",
      "10.000",
      "HASH",
      `Chainframe withdrawal ${job.signature}`,
      "treasury",
      undefined,
      operation,
    );
  });
  it.each(["issue", "transfer"])(
    "resumes saved %s without reading liquidity or mint prerequisites",
    async (operation) => {
      m.pending.mockResolvedValue({ intent: { operation, from: "treasury" } });
      await dispatchWithdrawalPayout(context, job);
      expect(m.state).not.toHaveBeenCalled();
      expect(m.dispatch.mock.calls[0].at(-1)).toBe(operation);
    },
  );
  it("reuses archived evidence first", async () => {
    m.archived.mockResolvedValue({
      intent: { operation: "issue", from: "treasury" },
    });
    await dispatchWithdrawalPayout(context, job);
    expect(m.pending).not.toHaveBeenCalled();
    expect(m.state).not.toHaveBeenCalled();
  });
  it("keeps legacy jobs transfer-only without checking liquidity", async () => {
    await dispatchWithdrawalPayout(context, {
      ...job,
      withdrawalPayoutPolicyVersion: undefined,
    } as IInboundTransaction);
    expect(m.state).not.toHaveBeenCalled();
    expect(m.dispatch.mock.calls[0].at(-1)).toBeUndefined();
  });
  it.each([{ issuer: "other" }, { maxSupply: "29.999" }, { precision: 8 }])(
    "parks failed prerequisites: %j",
    async (overrides) => {
      m.state.mockResolvedValue({ ...token, ...overrides });
      await expect(dispatchWithdrawalPayout(context, job)).rejects.toThrow(
        "reconciliation",
      );
      expect(m.dispatch).not.toHaveBeenCalled();
    },
  );
  it("permits minting the exact remaining supply", async () => {
    m.state.mockResolvedValue({ ...token, maxSupply: "30.000" });
    await dispatchWithdrawalPayout(context, job);
    expect(m.dispatch.mock.calls[0].at(-1)).toBe("issue");
  });
  it("parks unavailable balance reads before claiming a payout", async () => {
    m.state.mockRejectedValue(Error("secret network detail"));
    await expect(dispatchWithdrawalPayout(context, job)).rejects.toThrow(
      "reconciliation",
    );
    expect(m.dispatch).not.toHaveBeenCalled();
  });
  it.each([undefined, "unsupported"])(
    "rejects missing or unsupported operations on new saved intents: %s",
    async (operation) => {
      m.pending.mockResolvedValue({ intent: { operation, from: "treasury" } });
      await expect(dispatchWithdrawalPayout(context, job)).rejects.toThrow(
        "policy and intent differ",
      );
      expect(m.state).not.toHaveBeenCalled();
      expect(m.dispatch).not.toHaveBeenCalled();
    },
  );
  it("rejects unknown policies without reads or sends", async () => {
    await expect(
      dispatchWithdrawalPayout(context, {
        ...job,
        withdrawalPayoutPolicyVersion: 2,
      } as IInboundTransaction),
    ).rejects.toThrow("Unsupported");
    expect(m.state).not.toHaveBeenCalled();
    expect(m.dispatch).not.toHaveBeenCalled();
  });
});
