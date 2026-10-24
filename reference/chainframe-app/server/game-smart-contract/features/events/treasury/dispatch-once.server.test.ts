import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { HiveOperationError } from "@/lib/utils/hive/error";
import { logger } from "@/lib/logger.server";
import type { TreasuryIntent } from "@/lib/modules/transactions-pending/server.types";
import { SettlementUncertainError } from "./errors.server";

const m = vi.hoisted(() => ({
  pending: vi.fn(),
  archived: vi.fn(),
  claim: vi.fn(),
  submit: vi.fn(),
  record: vi.fn(),
  verify: vi.fn(),
}));
vi.mock("@/lib/config/config", () => ({
  config: {
    blockchain: { treasuryAccount: "treasury", marketAccount: "market" },
  },
}));
vi.mock("@/lib/modules/transactions-pending/server.repository", () => ({
  getPendingTreasuryTransfer: m.pending,
  claimTreasuryTransfer: m.claim,
  submitTreasuryTransfer: m.submit,
  recordTreasuryVerification: m.record,
}));
vi.mock("@/lib/modules/transactions-processed/server.repository", () => ({
  getArchivedTreasuryTransfer: m.archived,
}));
vi.mock("./verify.server", () => ({ verifyTreasuryTransfer: m.verify }));
import { dispatchTreasuryOnce } from "./dispatch-once.server";

const intent: TreasuryIntent = {
  accountAlias: "treasury",
  from: "treasury",
  to: "referrer",
  symbol: "HIVE",
  quantity: "7.500",
  memo: "Chainframe referral registration fixture",
};
beforeEach(() => {
  vi.resetAllMocks();
  m.claim.mockResolvedValue(true);
  m.verify.mockResolvedValue({
    status: "confirmed",
    evidence: { state: "confirmed", operationIndex: 0, blockNumber: 100 },
  });
  vi.spyOn(logger, "error").mockImplementation(() => {});
  vi.spyOn(logger, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("treasury send diagnostics retain uncertainty without exposing errors", () => {
  it.each([
    [{ success: true }, "MISSING_TRANSACTION_ID"],
    [{ success: false }, "UNSUCCESSFUL_RESULT"],
  ] as const)(
    "distinguishes an incomplete SDK result: %j",
    async (result, code) => {
      const send = vi.fn().mockResolvedValue(result);
      await expect(
        dispatchTreasuryOnce("source", "referral:source", intent, send),
      ).rejects.toBeInstanceOf(SettlementUncertainError);
      expect(send).toHaveBeenCalledOnce();
      expect(m.submit).not.toHaveBeenCalled();
      expect(m.verify).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledExactlyOnceWith(
        "treasury transfer requires reconciliation",
        {
          signature: "source",
          transferIdentity: "referral:source",
          stage: "send",
          code,
        },
      );
    },
  );
  it.each(["BROADCAST_FAILED", "injected-private-value"])(
    "keeps the %s exception as a cause and logs only allowed codes",
    async (code) => {
      const failure = new HiveOperationError(
        code as never,
        "secret error message",
        {
          key: "private-key-material",
          signedTransaction: "private-transaction",
        },
      );
      const send = vi.fn().mockRejectedValue(failure);
      const error = await dispatchTreasuryOnce(
        "source",
        "referral:source",
        intent,
        send,
      ).catch((cause) => cause);
      expect(error).toBeInstanceOf(SettlementUncertainError);
      expect(error.cause).toBe(failure);
      expect(send).toHaveBeenCalledOnce();
      expect(m.submit).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          stage: "send",
          code: code === "BROADCAST_FAILED" ? code : "SEND_EXCEPTION",
        }),
      );
      const output = JSON.stringify(vi.mocked(logger.error).mock.calls);
      for (const secret of [
        "secret error message",
        "private-key-material",
        "private-transaction",
        "injected-private-value",
      ])
        expect(output).not.toContain(secret);
      expect(JSON.stringify(error)).not.toContain("private-key-material");
    },
  );
  it("distinguishes failure to save a known broadcast ID without sending again", async () => {
    const failure = Error("database connection details");
    m.submit.mockRejectedValue(failure);
    const send = vi
      .fn()
      .mockResolvedValue({ success: true, transactionId: "tx" });
    const error = await dispatchTreasuryOnce(
      "source",
      "referral:source",
      intent,
      send,
    ).catch((cause) => cause);
    expect(error.cause).toBe(failure);
    expect(send).toHaveBeenCalledOnce();
    expect(m.verify).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        stage: "record-submission",
        code: "SUBMISSION_RECORD_FAILED",
      }),
    );
  });
  it("leaves a saved broadcasting claim parked without another send", async () => {
    m.pending.mockResolvedValue({
      key: "referral:source",
      intent,
      state: "broadcasting",
    });
    const send = vi.fn();
    await expect(
      dispatchTreasuryOnce("source", "referral:source", intent, send),
    ).rejects.toThrow("reconciliation");
    expect(send).not.toHaveBeenCalled();
    expect(m.claim).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "treasury transfer remains parked",
      {
        signature: "source",
        transferIdentity: "referral:source",
        stage: "existing-transfer",
        code: "UNCERTAIN_BROADCAST",
      },
    );
  });
});
