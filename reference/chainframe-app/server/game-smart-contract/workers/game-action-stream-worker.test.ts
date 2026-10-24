import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomJsonEvent, NormalizedBlock } from "hivexph-sdk";
import { emptyGameQueue } from "@/tests/fixtures/gameplay-queue";
const state = vi.hoisted(() => ({
  acquire: vi.fn(),
  renew: vi.fn(),
  release: vi.fn(),
  readiness: vi.fn(),
  recover: vi.fn(),
  savedRecovery: vi.fn(),
  process: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  watch: vi.fn(),
  properties: vi.fn(),
  activities: [] as unknown[],
}));
vi.mock("@/lib/logger.server", () => ({
  logger: { info: state.info, warn: state.warn, error: state.error },
}));
vi.mock("@/lib/chains/modules/hive/client", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/chains/modules/hive/client")
  >()),
  hiveClient: {
    blocks: { watch: state.watch },
    rpc: { getDynamicGlobalProperties: state.properties },
  },
}));
vi.mock("@/lib/modules/game-stats/server.repository", () => ({
  contractStreamRepository: {
    acquireLease: state.acquire,
    renewLease: state.renew,
    releaseLease: state.release,
  },
  setContractReadiness: state.readiness,
}));
vi.mock("@/lib/modules/transactions-pending/server.repository", () => ({
  listRecoverableGameActions: state.recover,
  readRecoverableGameBatches: state.savedRecovery,
  readQueuedGameBatches: emptyGameQueue,
}));
vi.mock(
  "@/server/game-smart-contract/features/events/process-game-action/action",
  () => ({
    createGameActionProcessor: () => ({ process: state.process }),
  }),
);
vi.mock("@/lib/utils/game/hive-activity", () => ({
  decodeHiveGameActivities: () => state.activities,
}));
vi.mock("@/lib/config/config", async (original) => {
  const actual = await original<typeof import("@/lib/config/config")>();
  return {
    config: {
      ...actual.config,
      game: {
        ...actual.config.game,
        stream: {
          ...actual.config.game.stream,
          maxRetries: 2,
          retryBackoffMs: 0,
        },
      },
    },
  };
});
import {
  createGameActionStream,
  runGameActionStreamWorker,
  resolveStreamStartBlock,
} from "./game-action-stream-worker";
import { type GameActionStreamPosition } from "@/server/game-smart-contract/features/types/stream";
const event = (blockNumber: number) =>
  ({
    eventId: "event-" + blockNumber,
    transactionId: "tx-" + blockNumber,
    blockNumber,
    blockTimestamp: "2026-10-10T00:00:00.000Z",
    transactionIndex: 0,
    operationIndex: 0,
    account: "alice",
    id: "chainframe-game",
    action: "claim",
    metadata: null,
    requiredAuths: [],
    requiredPostingAuths: ["alice"],
    raw: {},
  }) as CustomJsonEvent;
async function* events(...items: Array<CustomJsonEvent | NormalizedBlock>) {
  for (const item of items) yield item;
}
const block = (number: number) =>
  ({ blockNumber: number, transactions: [] }) as unknown as NormalizedBlock;
beforeEach(() => {
  vi.resetAllMocks();
  state.activities = [];
  state.acquire.mockResolvedValue(true);
  state.renew.mockResolvedValue(true);
  state.release.mockResolvedValue(undefined);
  state.readiness.mockResolvedValue(undefined);
  state.recover.mockResolvedValue([]);
  state.savedRecovery.mockImplementation(async function* () {});
  state.process.mockResolvedValue({ status: "executed" });
});
describe("game action stream worker recovery", () => {
  it("advances after durable quarantine and continues payment intake in the same block", async () => {
    state.process.mockResolvedValue({
      status: "quarantined",
      eventId: "raid",
      reason: "Raid settlement requires review",
    });
    state.activities = [
      { kind: "game", event: event(101) },
      {
        kind: "payment",
        blockNumber: 101,
        transactionId: "paid",
        operationIndex: 1,
        from: "carol",
        symbol: "HIVE",
      },
    ];
    const onPayment = vi.fn(async () => {});
    const position: GameActionStreamPosition = {};
    await runGameActionStreamWorker({
      position,
      resolveStartBlock: async () => 100,
      stream: events(block(101)),
      onPayment,
    });
    expect(state.process).toHaveBeenCalledOnce();
    expect(onPayment).toHaveBeenCalledOnce();
    expect(position.blockNumber).toBe(101);
    expect(state.warn).not.toHaveBeenCalled();
  });

  it("stops without advancing if scheduled recovery cannot establish durable state", async () => {
    state.savedRecovery.mockImplementation(async function* () {
      throw new Error("synthetic database read failure");
    });
    const position: GameActionStreamPosition = {};
    await expect(
      runGameActionStreamWorker({
        position,
        resolveStartBlock: async () => 100,
        stream: events(block(101)),
        onStart: async (_checkLease, recover) => {
          await recover();
        },
      }),
    ).rejects.toThrow("could not establish safe progress");
    expect(position.blockNumber).toBe(100);
    expect(state.release).toHaveBeenCalledOnce();
  });
  it("establishes readiness only after a successful block check and clears it on stop", async () => {
    const onStart = vi.fn(async () => {
      expect(state.readiness).toHaveBeenCalledExactlyOnceWith(
        expect.any(String),
        false,
      );
    });
    await runGameActionStreamWorker({
      resolveStartBlock: async () => 100,
      stream: events(block(101)),
      onStart,
    });
    expect(state.readiness.mock.calls.map((call) => call.slice(1))).toEqual([
      [false],
      [true, true],
      [false],
    ]);
  });
  it("never marks intake ready when queue insertion fails", async () => {
    state.activities = [
      { kind: "payment", transactionId: "payment", blockNumber: 101 },
    ];
    await expect(
      runGameActionStreamWorker({
        resolveStartBlock: async () => 100,
        stream: events(block(101)),
        onPayment: async () => {
          throw Error("queue unavailable");
        },
      }),
    ).rejects.toThrow("queue unavailable");
    expect(state.readiness.mock.calls.some((call) => call[1] === true)).toBe(
      false,
    );
  });
  it("captures the latest irreversible position before recovery and payment draining", async () => {
    const position: GameActionStreamPosition = {};
    state.recover.mockImplementation(async () => {
      expect(position.blockNumber).toBe(100);
      return [event(80)];
    });
    const resolver = vi.fn(async () => 100);
    const create = vi.fn(() => {
      expect(state.process).toHaveBeenCalledWith(event(80));
      return events();
    });
    const start = vi.fn(async () => {
      expect(position.blockNumber).toBe(100);
      expect(state.process).toHaveBeenCalledWith(event(80));
    });
    await runGameActionStreamWorker({
      position,
      resolveStartBlock: resolver,
      createStream: create,
      onStart: start,
    });
    expect(create).toHaveBeenCalledWith(expect.any(AbortSignal), 100);
    expect(resolver).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledOnce();
    expect(state.release).toHaveBeenCalledOnce();
    expect(state.info).toHaveBeenCalledWith(
      "Blockchain stream started",
      expect.objectContaining({
        fromBlock: 100,
        source: "latest-irreversible",
      }),
    );
  });
  it("resumes the last completed block inclusively after an in-process interruption", async () => {
    const position: GameActionStreamPosition = {};
    const resolver = vi.fn(async () => 100);
    async function* interrupted() {
      yield block(101);
      throw Error("RPC interrupted");
    }
    await expect(
      runGameActionStreamWorker({
        position,
        resolveStartBlock: resolver,
        stream: interrupted(),
      }),
    ).rejects.toThrow("RPC interrupted");
    expect(position.blockNumber).toBe(101);
    const create = vi.fn(() => events(block(101), block(102)));
    resolver.mockResolvedValue(200);
    await runGameActionStreamWorker({
      position,
      resolveStartBlock: resolver,
      createStream: create,
    });
    expect(resolver).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(expect.any(AbortSignal), 101);
    expect(position.blockNumber).toBe(102);
    expect(state.info).toHaveBeenCalledWith(
      "Blockchain stream started",
      expect.objectContaining({ fromBlock: 101, source: "in-memory-resume" }),
    );
  });
  it("selects the current irreversible block for each fresh process", async () => {
    state.properties
      .mockResolvedValueOnce({
        head_block_number: 120,
        last_irreversible_block_num: 100,
      })
      .mockResolvedValueOnce({
        head_block_number: 220,
        last_irreversible_block_num: 200,
      });
    const create = vi.fn(() => events());
    const first: GameActionStreamPosition = {},
      second: GameActionStreamPosition = {};
    await runGameActionStreamWorker({ position: first, createStream: create });
    await runGameActionStreamWorker({ position: second, createStream: create });
    expect(create).toHaveBeenNthCalledWith(1, expect.any(AbortSignal), 100);
    expect(create).toHaveBeenNthCalledWith(2, expect.any(AbortSignal), 200);
    expect(first.blockNumber).toBe(100);
    expect(second.blockNumber).toBe(200);
  });
  it("keeps the captured boundary when pending recovery fails", async () => {
    const position: GameActionStreamPosition = {};
    const resolver = vi.fn(async () => 100);
    state.recover.mockRejectedValueOnce(Error("queue unavailable"));
    await expect(
      runGameActionStreamWorker({
        position,
        resolveStartBlock: resolver,
        stream: events(),
      }),
    ).rejects.toThrow("queue unavailable");
    resolver.mockResolvedValue(200);
    await runGameActionStreamWorker({
      position,
      resolveStartBlock: resolver,
      stream: events(),
    });
    expect(resolver).toHaveBeenCalledOnce();
    expect(position.blockNumber).toBe(100);
  });
  it("advances in memory after fully checked empty blocks", async () => {
    const position: GameActionStreamPosition = {};
    await runGameActionStreamWorker({
      position,
      resolveStartBlock: async () => 100,
      stream: events(block(101)),
    });
    expect(state.process).not.toHaveBeenCalled();
    expect(position.blockNumber).toBe(101);
    expect(state.info).toHaveBeenCalledWith("Hive block checked", {
      blockNumber: 101,
      transactions: 0,
      gameActions: 0,
      payments: 0,
    });
  });
  it("does not advance past a failed gameplay operation", async () => {
    const position: GameActionStreamPosition = {};
    state.process.mockRejectedValue(Error("processing failed"));
    await expect(
      runGameActionStreamWorker({
        resolveStartBlock: async () => 100,
        stream: events(event(101)),
        position,
      }),
    ).rejects.toThrow("processing failed");
    expect(position.blockNumber).toBe(100);
    expect(state.release).toHaveBeenCalledOnce();
    expect(state.info).not.toHaveBeenCalledWith(
      "Hive block checked",
      expect.anything(),
    );
    expect(state.info).not.toHaveBeenCalledWith(
      "Game action processed",
      expect.anything(),
    );
    expect(state.warn).toHaveBeenCalledWith(
      "Game action processing retry",
      expect.objectContaining({
        transactionId: "tx-101",
        attempt: 1,
        code: "GAME_ACTION_RETRY",
      }),
    );
  });
  it("does not advance past a payment that could not be durably queued", async () => {
    const position: GameActionStreamPosition = {};
    state.activities = [{ kind: "payment" }];
    const payment = vi.fn(async () => {
      throw Error("queue unavailable");
    });
    await expect(
      runGameActionStreamWorker({
        resolveStartBlock: async () => 100,
        stream: events(block(101)),
        onPayment: payment,
        position,
      }),
    ).rejects.toThrow("queue unavailable");
    expect(position.blockNumber).toBe(100);
  });
  it("refuses a second worker and stops after lease loss", async () => {
    state.acquire.mockResolvedValueOnce(false);
    await expect(
      runGameActionStreamWorker({ resolveStartBlock: async () => 100 }),
    ).rejects.toThrow("already held");
    expect(state.process).not.toHaveBeenCalled();
    state.renew.mockResolvedValueOnce(false);
    await expect(
      runGameActionStreamWorker({ resolveStartBlock: async () => 100 }),
    ).rejects.toThrow("lease lost");
    expect(state.release).toHaveBeenCalledOnce();
  });
  it("stops and releases its lease without advancing an aborted event", async () => {
    const position: GameActionStreamPosition = {};
    const controller = new AbortController(),
      observed = vi.fn(() => controller.abort()),
      stop = vi.fn();
    await runGameActionStreamWorker({
      signal: controller.signal,
      resolveStartBlock: async () => 100,
      stream: events(event(101)),
      onEvent: observed,
      position,
      onStop: stop,
    });
    expect(observed).toHaveBeenCalledOnce();
    expect(position.blockNumber).toBe(100);
    expect(stop).toHaveBeenCalledOnce();
    expect(state.release).toHaveBeenCalledOnce();
  });
  it("rejects an invalid initial block before accepting processing", async () => {
    await expect(
      runGameActionStreamWorker({
        resolveStartBlock: async () => -1,
        stream: events(),
      }),
    ).rejects.toThrow("Invalid Hive stream start block");
    expect(state.process).not.toHaveBeenCalled();
    expect(state.release).toHaveBeenCalledOnce();
  });
  it.each([
    { status: "executed", action: "claim" },
    { status: "rejected", reason: "No claim charges available" },
  ])(
    "reports a durable action result with its operation identity: $status",
    async (result) => {
      state.process.mockResolvedValue(result);
      state.activities = [{ kind: "game", event: event(101) }];
      await runGameActionStreamWorker({
        resolveStartBlock: async () => 100,
        stream: events(block(101)),
      });
      expect(state.info).toHaveBeenCalledWith("Game action processed", {
        ...result,
        blockNumber: 101,
        transactionId: "tx-101",
        operationIndex: 0,
        account: "alice",
      });
      expect(state.info).toHaveBeenCalledWith(
        "Hive block checked",
        expect.objectContaining({
          blockNumber: 101,
          gameActions: 1,
          payments: 0,
        }),
      );
      expect(JSON.stringify(state.warn.mock.calls)).not.toContain(
        "processing failed",
      );
    },
  );
  it("does not advance or report completion if the lease is lost after payment intake", async () => {
    const position: GameActionStreamPosition = {};
    state.activities = [{ kind: "payment" }];
    await expect(
      runGameActionStreamWorker({
        position,
        resolveStartBlock: async () => 100,
        stream: events(block(101)),
        onPayment: async () => {
          state.renew.mockResolvedValue(false);
        },
      }),
    ).rejects.toThrow("lease lost");
    expect(position.blockNumber).toBe(100);
    expect(state.info).not.toHaveBeenCalledWith(
      "Hive block checked",
      expect.anything(),
    );
  });
  it("retains the previous completed block after a partial block failure", async () => {
    const position: GameActionStreamPosition = {};
    async function* stream() {
      yield block(100);
      state.activities = [
        { kind: "game", event: event(101) },
        { kind: "payment" },
      ];
      yield block(101);
    }
    const payment = vi.fn(async () => {
      throw Error("unsettled payment");
    });
    await expect(
      runGameActionStreamWorker({
        position,
        resolveStartBlock: async () => 100,
        stream: stream(),
        onPayment: payment,
      }),
    ).rejects.toThrow("unsettled payment");
    expect(state.process).toHaveBeenCalledWith(event(101));
    expect(position.blockNumber).toBe(100);
  });
  it("reports payment intake separately and checks the block after intake completes", async () => {
    const payment = {
      kind: "payment",
      blockNumber: 101,
      transactionId: "tx-payment",
      operationIndex: 1,
      from: "alice",
      symbol: "HIVE",
    };
    state.activities = [payment];
    const intake = vi.fn(async () => {
      expect(state.info).not.toHaveBeenCalledWith(
        "Hive block checked",
        expect.anything(),
      );
    });
    await runGameActionStreamWorker({
      resolveStartBlock: async () => 100,
      stream: events(block(101)),
      onPayment: intake,
    });
    expect(intake).toHaveBeenCalledWith(payment);
    expect(state.info).toHaveBeenCalledWith("Hive payment received", {
      blockNumber: 101,
      transactionId: "tx-payment",
      operationIndex: 1,
      from: "alice",
      symbol: "HIVE",
    });
    expect(state.info).toHaveBeenCalledWith(
      "Hive block checked",
      expect.objectContaining({ payments: 1 }),
    );
  });
});
describe("blockchain SDK stream diagnostics", () => {
  it("selects irreversible progress rather than the reversible head", async () => {
    state.properties.mockResolvedValue({
      head_block_number: 150,
      last_irreversible_block_num: 100,
    });
    expect(await resolveStreamStartBlock(new AbortController().signal)).toBe(
      100,
    );
  });
  it.each([0, -1, 1.5, Number.NaN, undefined])(
    "rejects invalid irreversible progress: %s",
    async (last_irreversible_block_num) => {
      state.properties.mockResolvedValue({ last_irreversible_block_num });
      await expect(
        resolveStreamStartBlock(new AbortController().signal),
      ).rejects.toThrow("Invalid Hive stream start block");
    },
  );
  it("reports SDK read failures and rereads the irreversible block before yielding", async () => {
    const observed = block(101),
      canonical = block(101);
    state.watch
      .mockImplementationOnce((options) => {
        options.onError(Error("RPC unavailable"), 101);
        return events(observed);
      })
      .mockImplementationOnce(() => events(canonical));
    state.properties.mockResolvedValue({ last_irreversible_block_num: 101 });
    const stream = createGameActionStream(new AbortController().signal, 101);
    expect(await stream.next()).toEqual({ done: false, value: canonical });
    expect(state.watch).toHaveBeenCalledTimes(2);
    expect(state.warn).toHaveBeenCalledWith(
      "Blockchain stream RPC error; SDK will retry",
      {
        blockNumber: 101,
        error: "RPC unavailable",
      },
    );
    await stream.return(undefined);
  });
  it("explains the finality wait and does not yield a reversible observation", async () => {
    const controller = new AbortController();
    state.watch.mockImplementationOnce(() => events(block(101)));
    state.properties.mockImplementation(async () => {
      controller.abort();
      return { last_irreversible_block_num: 100 };
    });
    const stream = createGameActionStream(controller.signal, 101);
    expect(await stream.next()).toEqual({ done: true, value: undefined });
    expect(state.info).toHaveBeenCalledWith(
      "Blockchain stream waiting for irreversible block",
      {
        blockNumber: 101,
        irreversibleBlock: 100,
      },
    );
    expect(state.watch).toHaveBeenCalledOnce();
  });
});
