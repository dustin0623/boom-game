vi.mock("@/lib/auth/session", () => ({
  requireSession: async (request: Request) => ({
    wallet: request.headers.get("x-test-wallet") ?? "alice",
    username: request.headers.get("x-test-wallet") ?? "alice",
  }),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  pending: [] as unknown[],
}));
vi.mock("@/lib/config/database", () => ({ connectDatabase: vi.fn() }));
vi.mock("@/lib/modules/transactions-processed/server.model", () => ({
  ProcessedTransactionModel: {
    find: vi.fn(() => ({
      sort: () => ({ limit: () => ({ lean: async () => mocks.rows }) }),
    })),
  },
}));
vi.mock("@/lib/modules/transactions-pending/server.repository", () => ({
  findPendingByWallet: async () => mocks.pending,
}));
import { readTransactions } from "@/tests/fixtures/api-reads";
const createMongoTransactionHistoryRepository = () => ({
  list: readTransactions,
});
import { createFixtureTransactionHistoryRepository } from "@/tests/fixtures/persistence/transaction-history-repository";
import { getFixtureState } from "@/tests/fixtures/persistence/store";
import type { GameEventRecord } from "@/lib/modules/transactions-pending/server.types";
beforeEach(() => {
  mocks.rows = [];
  mocks.pending = [];
  getFixtureState().gameEvents.clear();
});
const event: GameEventRecord = {
  actor: "alice",
  transactionId: "tx",
  operationIndex: 2,
  eventKey: "tx:2",
  eventId: "event",
  blockNumber: 1,
  transactionIndex: 0,
  status: "processed",
  updatedAt: 1,
  randomSeed: "private",
};
describe("normalized receipt provider contract", () => {
  it("exposes the recorded registration award without private settlement evidence", async () => {
    mocks.rows = [
      {
        _id: "000000000000000000000001",
        wallet: "alice",
        type: "registration",
        txHash: "registration",
        amount: 100,
        status: "success",
        processedAt: 1,
        metadata: {
          type: "registration",
          startingHash: 10,
          registrationHiveAmountPaid: 100,
          treasuryTransfers: [{ key: "private" }],
          privateProcessing: "private",
        },
      },
    ];
    const page = await readTransactions("alice", { limit: 10 });
    expect(page.history[0]).toMatchObject({
      amount: 100,
      metadata: { startingHash: 10, registrationHiveAmountPaid: 100 },
    });
    expect(JSON.stringify(page)).not.toContain("private");
  });
  it("exposes identical action operation identity in both providers", async () => {
    getFixtureState().gameEvents.set(event.eventKey, event);
    mocks.rows = [
      {
        _id: "000000000000000000000001",
        type: "game_action",
        txHash: "tx:2",
        amount: 0,
        status: "success",
        processedAt: 1,
        metadata: {
          type: "game_action",
          event: { ...event, result: { serverSeed: "private" } },
        },
      },
    ];
    for (const repository of [
      createFixtureTransactionHistoryRepository(),
      createMongoTransactionHistoryRepository(),
    ]) {
      const page = await repository.list("alice", { limit: 10 });
      expect(page.history[0]).toMatchObject({
        transactionId: "tx",
        operationIndex: 2,
        status: "success",
      });
      expect(JSON.stringify(page)).not.toContain("private");
    }
  });
  it("keeps financial payment operation identity in terminal and pending Mongo receipts", async () => {
    mocks.rows = [
      {
        _id: "000000000000000000000001",
        type: "shop_purchase",
        txHash: "payment",
        amount: 1,
        status: "failed",
        error: "Rejected",
        processedAt: 1,
        metadata: {
          type: "shop_purchase",
          paymentOperationIndex: 3,
          privateProcessing: "private",
          treasuryTransfers: [
            {
              key: "private-transfer",
              intent: { memo: "private-intent" },
              state: "confirmed",
              transactionId: "private-tx",
            },
          ],
        },
      },
    ];
    mocks.pending = [
      {
        _id: "pending",
        treasuryTransfers: [
          {
            key: "private-transfer",
            intent: { memo: "private-intent" },
            state: "confirmed",
            transactionId: "private-tx",
          },
        ],
        type: "shop_purchase",
        signature: "payment",
        paymentOperationIndex: 3,
        status: "pending",
        createdAt: 1,
      },
    ];
    const page = await createMongoTransactionHistoryRepository().list("alice", {
      limit: 10,
    });
    expect(page.history[0]).toMatchObject({
      transactionId: "payment",
      operationIndex: 3,
      status: "failed",
    });
    expect(page.pending[0]).toMatchObject({
      transactionId: "payment",
      operationIndex: 3,
    });
    expect(JSON.stringify(page)).not.toContain("private");
  });
});
