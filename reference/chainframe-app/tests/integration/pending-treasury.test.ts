import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/config/config", () => ({
  config: {
    blockchain: { treasuryAccount: "treasury", marketAccount: "market" },
  },
}));
const verification = vi.hoisted(() => vi.fn());
vi.mock(
  "@/server/game-smart-contract/features/events/treasury/verify.server",
  () => ({
    verifyTreasuryTransfer: verification,
  }),
);
vi.mock("@/lib/config/database", () => ({ connectDatabase: vi.fn() }));
vi.mock("@/lib/utils/database/operation.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/utils/database/operation.server")
  >()),
  withDatabasePreparation: (execute: () => Promise<unknown>) => execute(),
  withDatabaseOperation: (execute: () => Promise<unknown>) => execute(),
}));
import { InboundTransactionModel } from "@/lib/modules/transactions-pending/server.model";
import { ProcessedTransactionModel } from "@/lib/modules/transactions-processed/server.model";
import { recordTreasuryVerification } from "@/lib/modules/transactions-pending/server.repository";
import { dispatchTreasuryOnce } from "@/server/game-smart-contract/features/events/treasury/dispatch-once.server";
import { completePaymentJob } from "@/server/game-smart-contract/features/events/payment-processing/support";
import { reconcileTreasurySettlement } from "@/server/game-smart-contract/features/events/treasury/reconcile";
import type {
  TreasuryTransfer,
  IInboundTransaction,
} from "@/lib/modules/transactions-pending/server.types";
const pending = new Map<
  string,
  { signature: string; status: string; treasuryTransfers: TreasuryTransfer[] }
>();
const receipts = new Map<
  string,
  { metadata: { treasuryTransfers?: TreasuryTransfer[] } }
>();
const intent = {
  accountAlias: "treasury" as const,
  from: "treasury",
  to: "alice",
  quantity: "1.000",
  symbol: "HASH",
  memo: "withdrawal-1",
};
const job = {
  _id: "job",
  signature: "job",
  type: "withdrawal",
} as unknown as IInboundTransaction;
beforeEach(() => {
  vi.restoreAllMocks();
  verification.mockReset();
  verification.mockResolvedValue({
    status: "confirmed",
    evidence: { state: "confirmed", blockNumber: 100, operationIndex: 0 },
  });
  pending.clear();
  receipts.clear();
  pending.set("job", {
    signature: "job",
    status: "pending",
    treasuryTransfers: [],
  });
  vi.spyOn(InboundTransactionModel, "findOne").mockImplementation(((query: {
    signature: string;
  }) => ({
    lean: async () => pending.get(query.signature) ?? null,
    exec: async () => pending.get(query.signature) ?? null,
  })) as never);
  vi.spyOn(InboundTransactionModel, "updateOne").mockImplementation((async (
    query: {
      signature: string;
      status?: string;
      "treasuryTransfers.key"?: { $ne: string };
      treasuryTransfers?: {
        $elemMatch: {
          key: string;
          $or: Array<{ state: string; transactionId?: string }>;
        };
      };
    },
    update: {
      $push?: { treasuryTransfers: TreasuryTransfer };
      $set?: Record<string, unknown>;
    },
  ) => {
    const row = pending.get(query.signature);
    if (!row) return { matchedCount: 0, modifiedCount: 0 };
    if (update.$push) {
      const transfer = update.$push.treasuryTransfers;
      if (row.treasuryTransfers.some((t) => t.key === transfer.key))
        return { matchedCount: 0, modifiedCount: 0 };
      row.treasuryTransfers.push(structuredClone(transfer));
      return { matchedCount: 1, modifiedCount: 1 };
    }
    const match = query.treasuryTransfers?.$elemMatch;
    if (match) {
      const t = row.treasuryTransfers.find((t) => t.key === match.key);
      if (
        !t ||
        (match.$or &&
          !match.$or.some(
            (c) =>
              c.state === t.state &&
              (!c.transactionId || c.transactionId === t.transactionId),
          ))
      )
        return { matchedCount: 0 };
      const identity = (
        match as {
          $and?: Array<{
            $or: Array<{ transactionId?: string; state?: string }>;
          }>;
        }
      ).$and?.[0]?.$or;
      if (
        identity &&
        !identity.some((c) =>
          typeof c.transactionId === "string"
            ? t.transactionId === c.transactionId
            : t.state === "broadcasting" && !t.transactionId,
        )
      )
        return { matchedCount: 0 };
      const expectedId = (match as { transactionId?: string }).transactionId;
      if (typeof expectedId === "string" && t.transactionId !== expectedId)
        return { matchedCount: 0 };
      t.state = update.$set?.[
        "treasuryTransfers.$.state"
      ] as TreasuryTransfer["state"];
      t.transactionId = update.$set?.[
        "treasuryTransfers.$.transactionId"
      ] as string;
      if (update.$set?.["treasuryTransfers.$.blockNumber"] !== undefined)
        t.blockNumber = update.$set[
          "treasuryTransfers.$.blockNumber"
        ] as number;
      if (update.$set?.["treasuryTransfers.$.operationIndex"] !== undefined)
        t.operationIndex = update.$set[
          "treasuryTransfers.$.operationIndex"
        ] as number;
      if (update.$set?.["treasuryTransfers.$.verifiedAt"])
        t.verifiedAt = update.$set["treasuryTransfers.$.verifiedAt"] as number;
    } else if (update.$set?.status) row.status = update.$set.status as string;
    return { matchedCount: 1, modifiedCount: 1 };
  }) as never);
  vi.spyOn(InboundTransactionModel, "deleteOne").mockImplementation(
    (async () => {
      const row = pending.get("job");
      if (row?.treasuryTransfers.some((t) => t.state !== "confirmed"))
        return { deletedCount: 0 };
      return { deletedCount: Number(pending.delete("job")) };
    }) as never,
  );
  vi.spyOn(InboundTransactionModel, "exists").mockImplementation((async () =>
    pending.has("job")) as never);
  vi.spyOn(ProcessedTransactionModel, "findOne").mockImplementation(((query: {
    "metadata.treasuryTransfers.key": string;
  }) => ({
    lean: async () =>
      [...receipts.values()].find((r) =>
        r.metadata.treasuryTransfers?.some(
          (t) => t.key === query["metadata.treasuryTransfers.key"],
        ),
      ) ?? null,
  })) as never);
  vi.spyOn(ProcessedTransactionModel, "updateOne").mockImplementation((async (
    query: { txHash: string },
    update: { $set: { "metadata.treasuryTransfers": TreasuryTransfer[] } },
  ) => {
    const receipt = receipts.get(query.txHash);
    if (!receipt) return { matchedCount: 0 };
    receipt.metadata.treasuryTransfers = structuredClone(
      update.$set["metadata.treasuryTransfers"],
    );
    return { matchedCount: 1 };
  }) as never);
});
describe("pending job treasury protection", () => {
  it("never changes a saved transfer into a mint or adds a discriminator to a legacy intent", async () => {
    const send = vi.fn(async () => ({ success: true, transactionId: "tx" }));
    await dispatchTreasuryOnce(
      "job",
      "key",
      { ...intent, operation: "transfer" },
      send,
    );
    await expect(
      dispatchTreasuryOnce(
        "job",
        "key",
        { ...intent, operation: "issue" },
        send,
      ),
    ).rejects.toThrow("intent changed");
    await expect(
      dispatchTreasuryOnce("job", "key", intent, send),
    ).rejects.toThrow("intent changed");
    expect(send).toHaveBeenCalledOnce();
  });
  it("archives and reconciles a mint without rebroadcasting", async () => {
    pending.get("job")!.status = "reconciliation";
    pending
      .get("job")!
      .treasuryTransfers.push({
        key: "key",
        intent: { ...intent, operation: "issue" },
        state: "broadcasting",
      });
    await reconcileTreasurySettlement("job", "key", "tx");
    expect(verification).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "issue" }),
      "tx",
      undefined,
    );
    receipts.set("job", { metadata: {} });
    await completePaymentJob(job);
    expect(
      receipts.get("job")!.metadata.treasuryTransfers![0].intent.operation,
    ).toBe("issue");
    const send = vi.fn();
    await dispatchTreasuryOnce(
      "job",
      "key",
      { ...intent, operation: "issue" },
      send,
    );
    expect(send).not.toHaveBeenCalled();
  });
  it("broadcasts once and reuses a confirmed transfer", async () => {
    const send = vi.fn(async () => ({ success: true, transactionId: "tx" }));
    await dispatchTreasuryOnce("job", "key", intent, send);
    expect(
      await dispatchTreasuryOnce("job", "key", intent, send),
    ).toMatchObject({
      success: true,
      transactionId: "tx",
    });
    expect(send).toHaveBeenCalledOnce();
  });
  it("allows only one concurrent sender", async () => {
    const send = vi.fn(async () => ({ success: true, transactionId: "tx" }));
    const results = await Promise.allSettled([
      dispatchTreasuryOnce("job", "key", intent, send),
      dispatchTreasuryOnce("job", "key", intent, send),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(send).toHaveBeenCalledOnce();
  });
  it("holds thrown or missing-ID responses without rebroadcasting", async () => {
    const send = vi.fn(async () => ({ success: true }));
    await expect(
      dispatchTreasuryOnce("job", "key", intent, send),
    ).rejects.toThrow("reconciliation");
    await expect(
      dispatchTreasuryOnce("job", "key", intent, send),
    ).rejects.toThrow("reconciliation");
    expect(send).toHaveBeenCalledOnce();
  });
  it("refuses a changed intent and different confirmed transaction ID", async () => {
    const send = vi.fn(async () => ({ success: true, transactionId: "tx" }));
    await dispatchTreasuryOnce("job", "key", intent, send);
    await expect(
      dispatchTreasuryOnce(
        "job",
        "key",
        { ...intent, quantity: "2.000" },
        send,
      ),
    ).rejects.toThrow("intent changed");
    await expect(
      recordTreasuryVerification("job", "key", "other", {
        state: "confirmed",
        blockNumber: 100,
        operationIndex: 0,
      }),
    ).rejects.toThrow("identity changed");
  });
  it("does not broadcast without its pending parent", async () => {
    pending.clear();
    const send = vi.fn();
    await expect(
      dispatchTreasuryOnce("job", "key", intent, send),
    ).rejects.toThrow("reconciliation");
    expect(send).not.toHaveBeenCalled();
  });
  it("preserves an immutable old-brand memo and parks a newly requested memo without broadcasting", async () => {
    const stored = {
      key: "key",
      intent: { ...intent, memo: "CryptoCore withdrawal job" },
      state: "broadcasting" as const,
      transactionId: "old-submission",
    };
    pending.get("job")!.treasuryTransfers.push(structuredClone(stored));
    const send = vi.fn();
    await expect(
      dispatchTreasuryOnce("job", "key", { ...intent, memo: "Chainframe withdrawal job" }, send),
    ).rejects.toThrow("intent changed");
    expect(pending.get("job")!.treasuryTransfers).toEqual([stored]);
    expect(send).not.toHaveBeenCalled();
    expect(verification).not.toHaveBeenCalled();
  });
  it("re-verifies confirmation without execution evidence labels and waits without another broadcast", async () => {
    pending.get("job")!.treasuryTransfers.push({
      key: "key",
      intent,
      state: "confirmed",
      transactionId: "tx",
    });
    const send = vi.fn();
    verification.mockResolvedValueOnce({ status: "pending" });
    expect(
      await dispatchTreasuryOnce("job", "key", intent, send),
    ).toMatchObject({ status: "pending" });
    expect(
      await dispatchTreasuryOnce("job", "key", intent, send),
    ).toMatchObject({ status: "confirmed" });
    expect(verification).toHaveBeenCalledTimes(2);
    expect(send).not.toHaveBeenCalled();
  });
  it("parks confirmation-write failures without another send", async () => {
    const update = vi.mocked(InboundTransactionModel.updateOne);
    const original = update.getMockImplementation()!;
    update.mockImplementation(((...args: unknown[]) => {
      const op = args[1] as { $set?: Record<string, unknown> };
      if (op.$set?.["treasuryTransfers.$.state"]) throw Error("database down");
      return (original as (...args: unknown[]) => unknown)(...args);
    }) as never);
    const send = vi.fn(async () => ({ success: true, transactionId: "tx" }));
    await expect(
      dispatchTreasuryOnce("job", "key", intent, send),
    ).rejects.toThrow("reconciliation");
    await expect(
      dispatchTreasuryOnce("job", "key", intent, send),
    ).rejects.toThrow("reconciliation");
    expect(send).toHaveBeenCalledOnce();
  });
  it("archives before deletion and reuses the archived transfer", async () => {
    const send = vi.fn(async () => ({ success: true, transactionId: "tx" }));
    await dispatchTreasuryOnce("job", "key", intent, send);
    receipts.set("job", { metadata: {} });
    await completePaymentJob(job);
    expect(pending.has("job")).toBe(false);
    expect(
      receipts.get("job")?.metadata.treasuryTransfers?.[0].transactionId,
    ).toBe("tx");
    await dispatchTreasuryOnce("job", "key", intent, send);
    expect(send).toHaveBeenCalledOnce();
  });
  it("does not delete uncertain transfers or confirmed transfers without a receipt", async () => {
    pending
      .get("job")!
      .treasuryTransfers.push({ key: "key", intent, state: "broadcasting" });
    await expect(completePaymentJob(job)).rejects.toThrow("uncertain");
    expect(pending.has("job")).toBe(true);
    pending.get("job")!.treasuryTransfers[0] = {
      key: "key",
      intent,
      state: "confirmed",
      transactionId: "tx",
      verifiedAt: Date.now(),
      blockNumber: 100,
      operationIndex: 0,
    };
    await expect(completePaymentJob(job)).rejects.toThrow("processed receipt");
    expect(pending.has("job")).toBe(true);
  });
  it("verifies reconciliation and resumes the exact parent signature", async () => {
    pending.get("job")!.status = "reconciliation";
    pending.get("job")!.treasuryTransfers.push({
      key: "prefix:unrelated",
      intent,
      state: "broadcasting",
    });
    verification.mockRejectedValueOnce(new Error("does not match"));
    await expect(
      reconcileTreasurySettlement("job", "prefix:unrelated", "tx"),
    ).rejects.toThrow("does not match");
    await reconcileTreasurySettlement("job", "prefix:unrelated", "tx");
    expect(pending.get("job")?.status).toBe("pending");
    expect(pending.get("job")?.treasuryTransfers[0].transactionId).toBe("tx");
  });
});
