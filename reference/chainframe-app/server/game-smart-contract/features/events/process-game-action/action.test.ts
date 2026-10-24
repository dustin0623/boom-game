import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureGameplayQueue } from "@/tests/fixtures/gameplay-queue";
vi.mock(
  "@/lib/modules/transactions-pending/server.repository",
  async (original) => ({
    ...(await original<
      typeof import("@/lib/modules/transactions-pending/server.repository")
    >()),
    ...fixtureGameplayQueue(),
  }),
);
vi.mock("@/lib/modules/items/server.repository", () => ({
  get inventoryItemRepository() {
    return getFixtureRepositories().items;
  },
}));
import type { CustomJsonEvent } from "hivexph-sdk";
import {
  getFixtureRepositories,
  resetFixtureDatabase,
} from "@/tests/fixtures/persistence";
import {
  seedFixturePlayer,
  seedFixtureInventory,
  fixtureItemQuantities,
  getFixtureState,
} from "@/tests/fixtures/persistence/store";
import { resetSocialGuards } from "@/lib/utils/game/action-guards.server";
import { createGameActionRegistry } from "./dispatch";
import { gameActionSeed } from "@/lib/utils/game/execution-context.server";

import {
  buildUpgradeStatAction,
  buildHelpAction,
} from "@/lib/utils/game/action-protocol";
import { createGameActionProcessor } from "./action";
import { GameActionRejectedError } from "@/server/game-smart-contract/features/events/process-game-action/validation";

function event(
  eventId: string,
  payload: { version?: number; action: string; metadata: unknown },
  blockNumber = 100,
): CustomJsonEvent {
  return {
    eventId,
    transactionId: `tx-${eventId}`,
    blockNumber,
    blockTimestamp: "2026-10-10T00:00:00.000Z",
    transactionIndex: 0,
    operationIndex: 0,
    account: "alice",
    id: "chainframe-game",
    action: payload.action,
    metadata: payload.metadata as Record<string, unknown>,
    requiredAuths: [],
    requiredPostingAuths: ["alice"],
    raw: [
      "custom_json",
      {
        id: "chainframe-game",
        json: JSON.stringify(payload),
        required_auths: [],
        required_posting_auths: ["alice"],
      },
    ],
  };
}

describe("game action processor", () => {
  beforeEach(() => resetFixtureDatabase());
  it("rejects stale Help submissions after the caller sabotaged another stat", async () => {
    resetSocialGuards();
    seedFixturePlayer({ wallet: "alice", isRegistered: true });
    seedFixtureInventory("alice", { "help-kit": 1 });
    seedFixturePlayer({
      wallet: "bob",
      isRegistered: true,
      statEffects: {
        hashRate: {
          stat: "hashRate",
          itemId: "sabotage-device",
          appliedBy: "alice",
          appliedAt: 1,
          active: true,
          strength: 0.5,
          critical: false,
          helps: [],
        },
        security: {
          stat: "security",
          itemId: "sabotage-device",
          appliedBy: "carol",
          appliedAt: 1,
          active: true,
          strength: 0.5,
          critical: false,
          helps: [],
        },
      },
    });
    const effects = structuredClone(
      getFixtureState().players.get("bob")!.statEffects,
    );
    const processor = createGameActionProcessor(createGameActionRegistry());
    const result = await processor.process(
      event(
        "own-sabotage",
        buildHelpAction({
          target: "bob",
          consumableId: "help-kit",
          stat: "security",
          nonce: "help-stale-123456",
        }),
      ),
    );
    expect(result).toMatchObject({
      status: "rejected",
      reason: "You cannot help a player you have sabotaged.",
    });
    expect(fixtureItemQuantities("alice")["help-kit"]).toBe(1);
    expect(getFixtureState().players.get("bob")!.statEffects).toEqual(effects);
    expect(
      getFixtureState().logs.filter((log) => log.type === "help"),
    ).toHaveLength(0);
    expect(
      (await getFixtureRepositories().gameEvents.get("tx-own-sabotage:0"))
        ?.status,
    ).toBe("rejected");
  });
  it("validates and executes registered actions sequentially", async () => {
    const order: string[] = [];
    const first = vi.fn(async () => {
      order.push("first-start");
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push("first-end");
    });
    const second = vi.fn(() => order.push("second"));
    const processor = createGameActionProcessor({ upgrade_stat: first });
    const payload = buildUpgradeStatAction({
      stat: "hackPower",
      levels: 1,
      nonce: "processor-123456",
    });

    const firstResult = processor.process(event("one", payload));
    const secondResult = processor.process(
      event(
        "two",
        buildUpgradeStatAction({
          stat: "hackPower",
          levels: 1,
          nonce: "processor-654321",
        }),
        101,
      ),
    );

    await expect(firstResult).resolves.toMatchObject({
      status: "executed",
      eventId: "one",
    });
    await expect(secondResult).resolves.toMatchObject({
      status: "executed",
      eventId: "two",
    });
    expect(first).toHaveBeenCalledTimes(2);
    expect(order).toEqual([
      "first-start",
      "first-end",
      "first-start",
      "first-end",
    ]);
    expect(second).not.toHaveBeenCalled();
  });

  it("rejects invalid, unauthorized, and unregistered events without invoking handlers", async () => {
    const handler = vi.fn();
    const processor = createGameActionProcessor({ upgrade_stat: handler });
    const payload = buildUpgradeStatAction({
      stat: "hackPower",
      levels: 1,
      nonce: "processor-123456",
    });

    await expect(
      processor.process(
        event("invalid", { version: 99, action: "upgrade_stat", metadata: {} }),
      ),
    ).resolves.toMatchObject({ status: "rejected" });
    await expect(
      processor.process({
        ...event("active", payload),
        requiredAuths: ["alice"],
      }),
    ).resolves.toMatchObject({ status: "rejected" });
    await expect(
      processor.process({
        ...event("old-brand", payload),
        id: "cryptocore-game",
      }),
    ).resolves.toMatchObject({ status: "rejected" });
    await expect(
      processor.process(
        event("missing", { version: 1, action: "claim", metadata: {} }),
      ),
    ).resolves.toMatchObject({ status: "rejected" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("preserves transient handler failures for the caller", async () => {
    const processor = createGameActionProcessor({
      upgrade_stat: () => {
        throw new Error("database unavailable");
      },
    });

    await expect(
      processor.process(
        event(
          "transient",
          buildUpgradeStatAction({
            stat: "hackPower",
            levels: 1,
            nonce: "processor-123456",
          }),
        ),
      ),
    ).rejects.toThrow("database unavailable");
  });
});
describe("durable execution and recovery", () => {
  beforeEach(() => resetFixtureDatabase());
  const payload = () =>
    buildUpgradeStatAction({
      stat: "hashRate",
      levels: 1,
      nonce: "recovery-123456",
    });
  it("deduplicates an operation and rejects nonce reuse in another transaction", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const processor = createGameActionProcessor({ upgrade_stat: handler });
    await processor.process(event("first", payload()));
    await processor.process(event("first", payload()));
    expect(await processor.process(event("resigned", payload()))).toMatchObject(
      { status: "rejected", reason: "nonce already used by this account" },
    );
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it("preserves protocol, nonce, then timestamp rejection precedence", async () => {
    const handler = vi.fn();
    const processor = createGameActionProcessor({ upgrade_stat: handler });
    await processor.process(event("nonce-owner", payload()));
    const badTime = {
      ...event("nonce-reuse", payload()),
      blockTimestamp: "invalid",
    };
    expect(await processor.process(badTime)).toMatchObject({
      status: "rejected",
      reason: "nonce already used by this account",
    });
    expect(
      await processor.process({
        ...event("authority-before-nonce", payload()),
        requiredPostingAuths: ["bob"],
        blockTimestamp: "invalid",
      }),
    ).toMatchObject({
      status: "rejected",
      reason: "game actions require exactly one matching posting authority",
    });
    expect(
      await processor.process({
        ...event(
          "timestamp-only",
          buildUpgradeStatAction({
            stat: "hashRate",
            levels: 1,
            nonce: "new-time-123456",
          }),
        ),
        blockTimestamp: "invalid",
      }),
    ).toMatchObject({
      status: "rejected",
      reason: "invalid blockchain timestamp",
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
  it("preserves distinct operation indexes within one transaction", async () => {
    const handler = vi.fn();
    const processor = createGameActionProcessor({ upgrade_stat: handler });
    const first = event("multi", payload());
    const second = {
      ...event(
        "multi",
        buildUpgradeStatAction({
          stat: "hashRate",
          levels: 1,
          nonce: "another-123456",
        }),
      ),
      operationIndex: 1,
    };
    await processor.process(first);
    await processor.process(second);
    expect(handler).toHaveBeenCalledTimes(2);
  });
  it("parks domain writes when receipt persistence fails and refuses replay", async () => {
    const db = getFixtureRepositories();
    seedFixturePlayer({ wallet: "alice", hash: 10 });
    const seeds: (string | undefined)[] = [];
    const handler = async () => {
      seeds.push(gameActionSeed());
      await db.players.creditHash("alice", 5);
      return { ok: true, credited: 5 };
    };
    const terminal = vi
      .spyOn(db.gameEvents, "markProcessed")
      .mockRejectedValueOnce(new Error("receipt unavailable"));
    const processor = createGameActionProcessor({ upgrade_stat: handler });
    const submission = event("rollback", payload());
    await expect(processor.process(submission)).rejects.toThrow(
      "operator review",
    );
    expect((await db.players.findByWallet("alice"))?.hash).toBe(15);
    expect((await db.gameEvents.get("tx-rollback:0"))?.status).toBe(
      "reconciliation",
    );
    await expect(processor.process(submission)).rejects.toThrow(
      "operator review",
    );
    expect((await db.players.findByWallet("alice"))?.hash).toBe(15);
    expect((await db.gameEvents.get("tx-rollback:0"))?.result).toBeUndefined();
    expect(seeds[0]).toBeTruthy();
    expect(seeds).toHaveLength(1);
    terminal.mockRestore();
  });
  it("does not report rejection as rolled back after domain writes", async () => {
    const db = getFixtureRepositories();
    seedFixturePlayer({ wallet: "alice", hash: 10 });
    const processor = createGameActionProcessor({
      upgrade_stat: async () => {
        await db.players.creditHash("alice", 5);
        throw new GameActionRejectedError("Rejected");
      },
    });
    await expect(
      processor.process(event("rejected", payload())),
    ).rejects.toThrow("operator review");
    expect((await db.players.findByWallet("alice"))?.hash).toBe(15);
    expect((await db.gameEvents.get("tx-rejected:0"))?.status).toBe(
      "reconciliation",
    );
  });
  it("reclaims an expired job and fences the former claim token", async () => {
    const db = getFixtureRepositories(),
      submission = event("expired", payload());
    await db.gameEvents.claim(submission, "old");
    const record = (await db.gameEvents.get("tx-expired:0"))!;
    const seed = record.randomSeed;
    record.claimUntil = 0;
    expect(await db.gameEvents.listRecoverable()).toEqual([submission]);
    expect(await db.gameEvents.claim(submission, "new")).toBe("claimed");
    await expect(
      db.gameEvents.markProcessed("tx-expired:0", {}, "old"),
    ).rejects.toThrow("Stale");
    expect((await db.gameEvents.get("tx-expired:0"))?.randomSeed).toBe(seed);
    await db.gameEvents.markProcessed("tx-expired:0", { ok: true }, "new");
  });
  it("parks completed effects if the final lease check fails", async () => {
    const db = getFixtureRepositories();
    seedFixturePlayer({ wallet: "alice", hash: 10 });
    const processor = createGameActionProcessor(
      {
        upgrade_stat: async () => {
          await db.players.creditHash("alice", 5);
        },
      },
      async () => {
        throw new Error("lease lost");
      },
    );
    await expect(processor.process(event("lost", payload()))).rejects.toThrow(
      "operator review",
    );
    expect((await db.players.findByWallet("alice"))?.hash).toBe(15);
    expect((await db.gameEvents.get("tx-lost:0"))?.status).toBe(
      "reconciliation",
    );
  });
  it("uses the original version rather than a normalized action", async () => {
    const submission = event("wrong-version", { ...payload(), version: 99 });
    const processor = createGameActionProcessor({ upgrade_stat: vi.fn() });
    expect(await processor.process(submission)).toMatchObject({
      status: "rejected",
    });
    await expect(
      processor.process({
        ...event("missing-id", payload()),
        transactionId: null,
      }),
    ).rejects.toThrow("identity");
  });
  it("requires Active authority for withdrawal requests", async () => {
    const handler = vi.fn(() => ({ ok: true }));
    const processor = createGameActionProcessor({
      request_withdrawal: handler,
    });
    const withdrawal = {
      version: 1,
      action: "request_withdrawal",
      metadata: { amount: 1, nonce: "withdraw-123456" },
    };
    expect(
      await processor.process(event("posting-withdraw", withdrawal)),
    ).toMatchObject({ status: "rejected" });
    const active = {
      ...event("active-withdraw", {
        ...withdrawal,
        metadata: { amount: 1, nonce: "withdraw-654321" },
      }),
      requiredAuths: ["alice"],
      requiredPostingAuths: [],
    };
    expect(await processor.process(active)).toMatchObject({
      status: "executed",
    });
    expect(handler).toHaveBeenCalledOnce();
  });
});

vi.mock("@/lib/modules/players/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/players/server.repository")
  >()),
  playerRepository: new Proxy(
    {},
    {
      get: (_, key) =>
        getFixtureRepositories().players[
          key as keyof ReturnType<typeof getFixtureRepositories>["players"]
        ],
    },
  ),
}));
vi.mock("@/lib/modules/equipments/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/equipments/server.repository")
  >()),
  equipmentRepository: new Proxy(
    {},
    {
      get: (_, key) =>
        getFixtureRepositories().equipments[
          key as keyof ReturnType<typeof getFixtureRepositories>["equipments"]
        ],
    },
  ),
}));
vi.mock("@/lib/modules/logs/server.repository", async (original) => ({
  ...(await original<typeof import("@/lib/modules/logs/server.repository")>()),
  logRepository: new Proxy(
    {},
    {
      get: (_, key) =>
        getFixtureRepositories().logs[
          key as keyof ReturnType<typeof getFixtureRepositories>["logs"]
        ],
    },
  ),
}));
vi.mock("@/lib/modules/game-stats/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/game-stats/server.repository")
  >()),
  gameStatsRepository: new Proxy(
    {},
    {
      get: (_, key) =>
        getFixtureRepositories().gameStats[
          key as keyof ReturnType<typeof getFixtureRepositories>["gameStats"]
        ],
    },
  ),
}));
vi.mock(
  "@/server/game-smart-contract/features/events/process-game-action/persistence",
  () => ({
    gameActionPersistence: new Proxy(
      {},
      {
        get: (_, key) =>
          getFixtureRepositories().gameEvents[
            key as keyof ReturnType<typeof getFixtureRepositories>["gameEvents"]
          ],
      },
    ),
  }),
);
vi.mock("@/lib/utils/database/operation.server", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/utils/database/operation.server")
  >()),
  withDatabasePreparation: (execute: () => Promise<unknown>) => execute(),
  withDatabaseOperation: (execute: () => Promise<unknown>) => {
    const fixtures = getFixtureRepositories();
    return fixtures.transaction ? fixtures.transaction(execute) : execute();
  },
}));
