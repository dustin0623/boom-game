import { describe, expect, it } from "vitest";
import { mockDb } from "@/features/stores/mock/database";
import { createPollingContext } from "./context";
import { pollOnce } from "./transaction-poller";

const withdraw = { recipientAddress: "alice", assetType: "native" as const, symbol: "HIVE", amount: "1.000" };

describe("transaction poller (mock store)", () => {
  it("moves successful and exhausted transactions to processed", async () => {
    const ctx = createPollingContext({ maxAttempts: 1 });
    const ok = await ctx.pending.create({ type: "withdraw", playerId: "p1", metadata: withdraw });
    const bad = await ctx.pending.create({ type: "withdraw", playerId: "p1", metadata: withdraw });

    await pollOnce(ctx, async (tx) =>
      tx.transactionId === ok.transactionId ? { ok: true, onChainTxId: "abc" } : { ok: false, error: "boom" },
    );

    expect(mockDb.pendingTransactions.size).toBe(0);
    const done = await ctx.processed.findById(ok.transactionId);
    expect(done?.status).toBe("SUCCESS");
    expect(done?.onChainTxId).toBe("abc");
    expect(done?.metadata).toMatchObject(withdraw);
    expect((await ctx.processed.findById(bad.transactionId))?.status).toBe("FAILED");
  });

  it("releases retryable failures back to PENDING", async () => {
    const ctx = createPollingContext({ maxAttempts: 3 });
    const tx = await ctx.pending.create({
      type: "purchase",
      playerId: "p2",
      metadata: { itemId: "chest-1", itemCategory: "chest", quantity: 1, price: "5", currency: "SCRAP" },
    });
    await pollOnce(ctx, async () => ({ ok: false, error: "rpc down" }));
    const row = await ctx.pending.findById(tx.transactionId);
    expect(row?.status).toBe("PENDING");
    expect(row?.attempts).toBe(1);
  });

  it("rejects metadata that does not match the type template", async () => {
    const ctx = createPollingContext();
    await expect(
      ctx.pending.create({ type: "withdraw", playerId: "p3", metadata: { amount: "1" } as never }),
    ).rejects.toThrow();
  });

  it("is idempotent on transactionId", async () => {
    const ctx = createPollingContext();
    const a = await ctx.pending.create({ transactionId: "fixed-1", type: "register", playerId: "p4", metadata: {} });
    const b = await ctx.pending.create({ transactionId: "fixed-1", type: "register", playerId: "p4", metadata: {} });
    expect(a.transactionId).toBe(b.transactionId);
  });
});
