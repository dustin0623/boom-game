import {
  fixtureItemQuantities,
  seedFixtureInventory,
} from "@/tests/fixtures/persistence/store";
// Step 17 concurrency and anti-abuse suite.
//
// Races the real route handlers and event actions against one shared in-memory
// state. The raid writes are stateful fakes of the MongoDB repository: each one
// yields once before its check-and-write (so requests genuinely interleave) and
// then checks and writes with no await in between, which is the same guarantee
// the conditional updates in repository.server.ts give. The raid-writes unit
// tests cover the real queries; this suite proves the route + actions compose
// into no duplicate transition, item, HASH transfer or Notoriety.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { raidJournalFixture } from "@/tests/fixtures/raid-journal";
import { withGameExecution } from "@/lib/utils/game/execution-context.server";
vi.mock(
  "@/lib/modules/transactions-pending/server.repository",
  () => raidJournalFixture,
);

vi.mock("@/lib/auth/session", () => ({
  requireSession: async (request: Request) => ({
    wallet: (request.headers.get("authorization") ?? "").replace("Bearer ", ""),
    username: "u",
  }),
}));
vi.mock("@/tests/fixtures/persistence", async () => {
  const { createFixtureRepositories } =
    await import("@/tests/fixtures/persistence");
  const db = createFixtureRepositories();
  const repository = await import("@/lib/modules/players/server.repository");
  Object.assign(db.players, {
    reserveRaidCharge: repository.reserveRaidCharge,
    claimRaidDefender: repository.claimRaidDefender,
    creditRaidProceeds: repository.creditRaidProceeds,
    clearStatEffects: repository.clearStatEffects,
    debitRaidRisk: repository.debitRaidRisk,
    incrementRaidFields: repository.incrementPlayer,
  });
  return { getFixtureRepositories: () => db };
});
vi.mock("@/lib/modules/players/server.repository", async (_original) => ({
  applyRaidStep: (
    ...args: Parameters<typeof raidJournalFixture.applyRaidStep>
  ) => raidJournalFixture.applyRaidStep(...args),
  readActiveRaid: raidJournalFixture.readActiveRaid,
  ...(await (async () => {
    const { getFixtureState } =
      await import("@/tests/fixtures/persistence/store");
    const players = () => getFixtureState().players;
    const yieldOnce = () => Promise.resolve();
    return {
      findPlayerByWallet: vi.fn(async (wallet: string) => {
        const p = players().get(wallet);
        return p ? { ...p } : null;
      }),
      updatePlayer: vi.fn(async () => undefined),
      incrementPlayer: vi.fn(
        async (wallet: string, inc: Record<string, number>) => {
          const p = players().get(wallet) as unknown as
            Record<string, number> | undefined;
          if (!p) return;
          for (const [key, value] of Object.entries(inc))
            p[key] = (p[key] ?? 0) + value;
        },
      ),
      reserveRaidCharge: vi.fn(async (wallet: string) => {
        await yieldOnce();
        const p = players().get(wallet);
        if (!p || p.raidCharges < 1) return { ok: false };
        p.raidCharges -= 1;
        return { ok: true };
      }),
      claimRaidDefender: vi.fn(
        async (wallet: string, taken: number, now: number, until: number) => {
          await yieldOnce();
          const p = players().get(wallet);
          if (!p || p.vault < taken || p.protectionUntil > now)
            return { ok: false };
          p.vault -= taken;
          p.protectionUntil = until;
          return { ok: true };
        },
      ),
      creditRaidProceeds: vi.fn(
        async (
          wallet: string,
          input: { received: number; capacity: number; xp: number },
        ) => {
          await yieldOnce();
          const p = players().get(wallet);
          if (!p) return { ok: false, credited: 0 };
          const credited = Math.min(
            input.received,
            Math.max(0, input.capacity - p.vault),
          );
          p.vault += credited;
          p.notoriety += credited;
          p.xp += input.xp;
          return { ok: true, credited };
        },
      ),
      clearStatEffects: vi.fn(async (wallet: string) => {
        await yieldOnce();
        const p = players().get(wallet);
        const before = p?.statEffects ? { ...p.statEffects } : {};
        if (p) delete p.statEffects;
        return before;
      }),
      debitRaidRisk: vi.fn(async (wallet: string, amount: number) => {
        await yieldOnce();
        const p = players().get(wallet);
        if (!p) return { ok: false, deducted: 0 };
        const deducted = Math.min(amount, p.vault);
        p.vault -= deducted;
        return { ok: true, deducted };
      }),
    };
  })()),
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
vi.mock("@/features/events/backend/raid/log", () => ({ logRaid: vi.fn() }));
vi.mock(
  "@/features/events/backend/raid/calculations.server",
  async (original) => {
    const actual =
      await original<
        typeof import("@/features/events/backend/raid/calculations.server")
      >();
    const { gameActionSeed } =
      await import("@/lib/utils/game/execution-context.server");
    const { RIVAL_RAID_COOLDOWN_MS } =
      await import("@/lib/config/constants/game");
    const blocked = {
      success: false,
      reason: "blocked",
      chance: 0,
      stealPercent: 0,
      exposure: 0,
      critical: false,
      takenFromVault: 0,
      stolen: 0,
      destroyed: 0,
      notorietyGained: 0,
      xp: 0,
      serverSeed: "",
    };
    return {
      regenCharges: actual.regenCharges,
      // Always wins unless the defender is protected, like the real simulation.
      simulateRaid: vi.fn(
        (_attacker: unknown, defender: { protectionUntil: number }) =>
          defender.protectionUntil > Date.now()
            ? { ...blocked }
            : {
                success: true,
                reason: "success",
                chance: 0.5,
                stealPercent: 0.25,
                exposure: 0.25,
                critical: false,
                takenFromVault: 25,
                stolen: 25,
                destroyed: 0,
                notorietyGained: 25,
                riskAmount: 0,
                defenderNotorietyGained: 0,
                xp: 10,
                serverSeed: gameActionSeed(),
              },
      ),
      logRaid: vi.fn(),
      gearExploitOf: vi.fn(() => 0),
      summarizeStatEffects: vi.fn(() => ({})),
      raidProtectionUntil: (now: number) => now + RIVAL_RAID_COOLDOWN_MS,
    };
  },
);
vi.mock("@/lib/modules/game-stats/server.repository", async (_original) => ({
  incrementSettlementStat: async () => {},
  ...(await (() => ({ incrementStat: vi.fn() }))()),
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
vi.mock("@/lib/modules/logs/server.repository", async (_original) => ({
  ...(await (() => ({
    countSupportRewardsSince: vi.fn(async () => 0),
  }))()),
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

import {
  getFixtureState,
  resetFixtureDatabase,
  seedFixturePlayer as originalSeed,
} from "@/tests/fixtures/persistence/store";
import { RIVAL_RAID_COOLDOWN_MS } from "@/lib/config/constants/game";
import { resetSocialGuards } from "@/lib/utils/game/action-guards.server";
import { helpTarget as domainHelpTarget } from "@/features/events/backend/social-actions/help";
import { sabotageTarget as domainSabotageTarget } from "@/features/events/backend/social-actions/sabotage";
import { raidTarget } from "@/features/events/backend/raid/action";
import { getFixtureRepositories } from "@/tests/fixtures/persistence";

const helpTarget = (...args: Parameters<typeof domainHelpTarget>) =>
  getFixtureRepositories().transaction(() => domainHelpTarget(...args));
const sabotageTarget = (...args: Parameters<typeof domainSabotageTarget>) =>
  getFixtureRepositories().transaction(() => domainSabotageTarget(...args));

const seedFixturePlayer = (overrides: Parameters<typeof originalSeed>[0]) =>
  originalSeed({
    isRegistered: true,
    statLevels: {
      hashRate: 1,
      hackPower: 2,
      security: 1,
      luck: 0,
      firewall: 0,
      exploit: 0,
    },
    ...overrides,
  });
const player = (wallet: string) => getFixtureState().players.get(wallet)!;

async function raid(attacker: string, target: string, seed = "seed") {
  const key = `raid-${crypto.randomUUID()}`;
  const result = await getFixtureRepositories().transaction(() =>
    withGameExecution(
      Date.now(),
      key,
      () => raidTarget(attacker, target, seed),
      key,
    ),
  );
  return Response.json(result.body, { status: result.status });
}

const statEffect = (
  stat: "hashRate" | "hackPower" | "security",
  appliedBy: string,
  strength = 0.5,
) => ({
  stat,
  itemId: "sabotage-device" as const,
  appliedBy,
  appliedAt: 1,
  active: true,
  strength,
  critical: false,
  helps: [],
});

const totalOf = (wallets: string[], read: (wallet: string) => number) =>
  wallets.reduce((sum, wallet) => sum + read(wallet), 0);

beforeEach(() => {
  resetFixtureDatabase();
  resetSocialGuards();
  vi.clearAllMocks();
  vi.spyOn(Math, "random").mockReturnValue(0.1);
  // These races isolate raid writes; elapsed mining has its own settlement coverage.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-10-18T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("raid + raid", () => {
  it("two attackers racing for one defender move the HASH and award Notoriety once", async () => {
    seedFixturePlayer({ wallet: "0xD", vault: 100, vaultStaked: 1_000 });
    seedFixturePlayer({ wallet: "0xA1", vaultStaked: 1_000 });
    seedFixturePlayer({ wallet: "0xA2", vaultStaked: 1_000 });

    const [a, b] = await Promise.all([
      raid("0xA1", "0xD"),
      raid("0xA2", "0xD"),
    ]);
    const bodies = [await a.json(), await b.json()];

    expect(bodies.filter((body) => body.ok)).toHaveLength(1);
    expect(
      bodies
        .filter((body) => !body.ok)
        .every((body) => body.reason === "blocked"),
    ).toBe(true);
    expect(player("0xD").vault).toBe(75);
    expect(totalOf(["0xA1", "0xA2"], (w) => player(w).vault)).toBe(25);
    expect(totalOf(["0xA1", "0xA2"], (w) => player(w).notoriety)).toBe(25);
    expect(player("0xD").protectionUntil).toBeGreaterThan(Date.now());
  });

  it("one attacker with a single charge cannot raid two defenders at once", async () => {
    seedFixturePlayer({ wallet: "0xA", raidCharges: 1, vaultStaked: 1_000 });
    seedFixturePlayer({ wallet: "0xD1", vault: 100, vaultStaked: 1_000 });
    seedFixturePlayer({ wallet: "0xD2", vault: 100, vaultStaked: 1_000 });

    const responses = await Promise.all([
      raid("0xA", "0xD1"),
      raid("0xA", "0xD2"),
    ]);

    expect(responses.map((res) => res.status).sort()).toEqual([200, 400]);
    expect(player("0xA").raidCharges).toBe(0);
    expect(player("0xA").vault).toBe(25);
    expect(player("0xA").notoriety).toBe(25);
    expect(totalOf(["0xD1", "0xD2"], (w) => player(w).vault)).toBe(175);
  });

  it("stat effects are consumed by exactly one of two simultaneous raids and then cleared", async () => {
    seedFixturePlayer({
      wallet: "0xD",
      vault: 100,
      vaultStaked: 1_000,
      statEffects: {
        security: statEffect("security", "0xS", 0.4),
        hashRate: statEffect("hashRate", "0xS"),
      },
    });
    seedFixturePlayer({ wallet: "0xA1", vaultStaked: 1_000 });
    seedFixturePlayer({ wallet: "0xA2", vaultStaked: 1_000 });

    await Promise.all([raid("0xA1", "0xD"), raid("0xA2", "0xD")]);

    const consumed = raidJournalFixture.consumedEffects();
    expect(
      consumed.filter((effects) => Object.keys(effects).length > 0),
    ).toHaveLength(1);
    expect(player("0xD").statEffects).toBeUndefined();
  });

  it("a raid leaves the attacker's own stat effects in place", async () => {
    seedFixturePlayer({ wallet: "0xD", vault: 100, vaultStaked: 1_000 });
    seedFixturePlayer({
      wallet: "0xA",
      vaultStaked: 1_000,
      statEffects: { hackPower: statEffect("hackPower", "0xS", 0.3) },
    });

    await raid("0xA", "0xD");

    expect(player("0xA").statEffects?.hackPower?.active).toBe(true);
  });
});

describe("sabotage + sabotage", () => {
  it("two different callers racing for one target: one state, one item spent", async () => {
    seedFixturePlayer({ wallet: "0xT" });
    seedFixturePlayer({
      wallet: "0xS1",
    });
    seedFixtureInventory("0xS1", { "sabotage-device": 1 });
    seedFixturePlayer({
      wallet: "0xS2",
    });
    seedFixtureInventory("0xS2", { "sabotage-device": 1 });

    const results = await Promise.all([
      sabotageTarget("0xS1", "0xT", "sabotage-device", "hashRate"),
      sabotageTarget("0xS2", "0xT", "sabotage-device", "hashRate"),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(player("0xT").statEffects?.hashRate?.active).toBe(true);
    const owned = totalOf(
      ["0xS1", "0xS2"],
      (w) => fixtureItemQuantities(w)["sabotage-device"] ?? 0,
    );
    expect(owned).toBe(1);
  });

  it("racing on different stats of one target: both apply and both items are spent", async () => {
    seedFixturePlayer({ wallet: "0xT" });
    seedFixturePlayer({
      wallet: "0xS1",
    });
    seedFixtureInventory("0xS1", { "sabotage-device": 1 });
    seedFixturePlayer({
      wallet: "0xS2",
    });
    seedFixtureInventory("0xS2", { "sabotage-device": 1 });

    const results = await Promise.all([
      sabotageTarget("0xS1", "0xT", "sabotage-device", "hashRate"),
      sabotageTarget("0xS2", "0xT", "sabotage-device", "hackPower"),
    ]);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(player("0xT").statEffects?.hashRate?.active).toBe(true);
    expect(player("0xT").statEffects?.hackPower?.active).toBe(true);
    expect(
      totalOf(
        ["0xS1", "0xS2"],
        (w) => fixtureItemQuantities(w)["sabotage-device"] ?? 0,
      ),
    ).toBe(0);
  });

  it("a double submit by one caller spends one item", async () => {
    seedFixturePlayer({ wallet: "0xT" });
    seedFixturePlayer({ wallet: "0xS" });
    seedFixtureInventory("0xS", { "sabotage-device": 3 });

    const results = await Promise.all([
      sabotageTarget("0xS", "0xT", "sabotage-device", "hashRate"),
      sabotageTarget("0xS", "0xT", "sabotage-device", "hashRate"),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(fixtureItemQuantities("0xS")["sabotage-device"]).toBe(2);
  });
});

describe("help + help", () => {
  it("two helpers racing on one sabotaged stat: every spent item is a stored Help", async () => {
    seedFixturePlayer({
      wallet: "0xT",
      statEffects: { hashRate: statEffect("hashRate", "0xS") },
    });
    seedFixturePlayer({ wallet: "0xH1" });
    seedFixtureInventory("0xH1", { "help-kit": 1 });
    seedFixturePlayer({ wallet: "0xH2" });
    seedFixtureInventory("0xH2", { "help-kit": 1 });

    const results = await Promise.all([
      helpTarget("0xH1", "0xT", "help-kit", "hashRate"),
      helpTarget("0xH2", "0xT", "help-kit", "hashRate"),
    ]);

    const wins = results.filter((r) => r.ok).length;
    expect(wins).toBeGreaterThanOrEqual(1);
    expect(player("0xT").statEffects?.hashRate?.helps).toHaveLength(wins);
    const owned = totalOf(
      ["0xH1", "0xH2"],
      (w) => fixtureItemQuantities(w)["help-kit"] ?? 0,
    );
    expect(owned).toBe(2 - wins);
  });

  it("helpers on different stats of one target both land", async () => {
    seedFixturePlayer({
      wallet: "0xT",
      statEffects: {
        hashRate: statEffect("hashRate", "0xS"),
        security: statEffect("security", "0xS"),
      },
    });
    seedFixturePlayer({ wallet: "0xH1" });
    seedFixtureInventory("0xH1", { "help-kit": 1 });
    seedFixturePlayer({ wallet: "0xH2" });
    seedFixtureInventory("0xH2", { "help-kit": 1 });

    const results = await Promise.all([
      helpTarget("0xH1", "0xT", "help-kit", "hashRate"),
      helpTarget("0xH2", "0xT", "help-kit", "security"),
    ]);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(player("0xT").statEffects?.hashRate?.helps).toHaveLength(1);
    expect(player("0xT").statEffects?.security?.helps).toHaveLength(1);
  });

  it("distinct sequential Help actions consume one item each", async () => {
    seedFixturePlayer({
      wallet: "0xT",
      statEffects: { hashRate: statEffect("hashRate", "0xS") },
    });
    seedFixturePlayer({ wallet: "0xH" });
    seedFixtureInventory("0xH", { "help-kit": 3 });

    const results = await Promise.all([
      helpTarget("0xH", "0xT", "help-kit", "hashRate"),
      helpTarget("0xH", "0xT", "help-kit", "hashRate"),
    ]);

    const applied = results.filter((r) => r.ok).length;
    expect(applied).toBeGreaterThanOrEqual(1);
    expect(fixtureItemQuantities("0xH")["help-kit"]).toBe(3 - applied);
  });
});

describe("sabotage + raid", () => {
  const orders = [
    ["sabotage first", true],
    ["raid first", false],
  ] as const;

  it.each(orders)(
    "never duplicates or loses the state or the item (%s)",
    async (_label, sabotageFirst) => {
      // Every raid settles mining, so its seeded vault must fit the defender's capacity.
      seedFixturePlayer({ wallet: "0xD", vault: 100, vaultStaked: 1_000 });
      seedFixturePlayer({ wallet: "0xA", vaultStaked: 1_000 });
      seedFixturePlayer({
        wallet: "0xS",
      });
      seedFixtureInventory("0xS", { "sabotage-device": 1 });

      const sabotagePromise = () =>
        sabotageTarget("0xS", "0xD", "sabotage-device", "hashRate");
      const raidPromise = () => raid("0xA", "0xD");
      const [sabotage] = sabotageFirst
        ? await Promise.all([sabotagePromise(), raidPromise()])
        : (await Promise.all([raidPromise(), sabotagePromise()])).reverse();

      const stillActive = player("0xD").statEffects?.hashRate?.active ? 1 : 0;
      const applied = (sabotage as { ok: boolean }).ok ? 1 : 0;

      // A raid resets the defender, so an applied Sabotage is either cleared (it landed before the
      // reset) or stored exactly once (it landed after); it is never duplicated, and a rejected
      // one costs nothing.
      expect(stillActive).toBeLessThanOrEqual(applied);
      expect(fixtureItemQuantities("0xS")["sabotage-device"]).toBe(1 - applied);
      // The raid itself moved the HASH once regardless of the Sabotage outcome.
      expect(player("0xD").vault).toBe(75);
      expect(player("0xA").vault).toBe(25);
      expect(player("0xA").notoriety).toBe(25);
    },
  );
});

describe("A to B to A farming", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000_000);
  });

  it("protects a raided player for the rival cooldown, then lets the raid land again", async () => {
    seedFixturePlayer({ wallet: "0xA", vault: 100, vaultStaked: 1_000 });
    seedFixturePlayer({ wallet: "0xB", vault: 100, vaultStaked: 1_000 });

    expect((await (await raid("0xA", "0xB")).json()).ok).toBe(true);
    expect(player("0xB").protectionUntil).toBe(
      Date.now() + RIVAL_RAID_COOLDOWN_MS,
    );

    // B hits back: A was never raided, so A has no protection.
    expect((await (await raid("0xB", "0xA")).json()).ok).toBe(true);

    // A cannot immediately raid B again: B is protected, nothing moves.
    const vaultBefore = player("0xB").vault;
    const retry = await (await raid("0xA", "0xB")).json();
    expect(retry).toMatchObject({
      ok: false,
      reason: "blocked",
      stolen: 0,
      notorietyGained: 0,
    });
    expect(player("0xB").vault).toBe(vaultBefore);

    vi.setSystemTime(Date.now() + RIVAL_RAID_COOLDOWN_MS + 1);
    expect((await (await raid("0xA", "0xB")).json()).ok).toBe(true);
  });

  it("is bounded by raid charges: a blocked attempt still spends one, so the loop cannot run free", async () => {
    seedFixturePlayer({
      wallet: "0xA",
      vault: 100,
      vaultStaked: 1_000,
      raidCharges: 2,
    });
    seedFixturePlayer({ wallet: "0xB", vault: 100, vaultStaked: 1_000 });

    await raid("0xA", "0xB");
    await raid("0xA", "0xB");
    expect(player("0xA").raidCharges).toBe(0);

    vi.setSystemTime(Date.now() + RIVAL_RAID_COOLDOWN_MS + 1);
    const out = await raid("0xA", "0xB");

    expect(out.status).toBe(400);
    expect((await out.json()).error).toBe("No raid charges");
  });
});

vi.mock("@/lib/modules/equipments/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/equipments/server.repository")
  >()),
  equipmentRepository: new Proxy(
    {},
    {
      get: (_, key) =>
        getFixtureRepositories().items[
          key as keyof ReturnType<typeof getFixtureRepositories>["items"]
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
vi.mock("@/lib/modules/items/server.repository", () => ({
  get inventoryItemRepository() {
    return getFixtureRepositories().items;
  },
}));
