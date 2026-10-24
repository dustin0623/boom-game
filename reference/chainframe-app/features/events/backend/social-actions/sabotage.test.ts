import {
  fixtureItemQuantities,
  seedFixtureInventory,
} from "@/tests/fixtures/persistence/store";
import { socialActionInput } from "@/features/types/game/consumables";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/tests/fixtures/persistence", async () => {
  const { createFixtureRepositories } =
    await import("@/tests/fixtures/persistence");
  const db = createFixtureRepositories();
  return { getFixtureRepositories: () => db };
});

import { getFixtureRepositories } from "@/tests/fixtures/persistence";
import {
  getFixtureState,
  resetFixtureDatabase,
  seedFixturePlayer,
} from "@/tests/fixtures/persistence/store";
import { SOCIAL_ECONOMY } from "@/lib/config/constants/economy";
import { resetSocialGuards } from "@/lib/utils/game/action-guards.server";
import { sabotageTarget } from "./sabotage";

const CALLER = "0xCALLER";
const TARGET = "0xTARGET";

const player = (wallet: string) => getFixtureState().players.get(wallet)!;

function seed(consumables: Record<string, number> = { "sabotage-device": 1 }) {
  seedFixturePlayer({ wallet: CALLER });
  seedFixtureInventory(CALLER, consumables);
  seedFixturePlayer({ wallet: TARGET });
}

beforeEach(() => {
  resetFixtureDatabase();
  resetSocialGuards();
  vi.restoreAllMocks();
  vi.spyOn(Math, "random").mockReturnValue(0.1);
});

describe("useSabotageInput", () => {
  it("accepts a target, item and stat and strips everything else", () => {
    expect(
      socialActionInput.parse({
        target: "0xT",
        itemId: "sabotage-device",
        stat: "security",
        strength: 1,
        appliedBy: "0xEVIL",
      }),
    ).toEqual({ target: "0xT", itemId: "sabotage-device", stat: "security" });
  });

  it("rejects a missing target, unknown item, or missing or unsupported stat", () => {
    expect(() =>
      socialActionInput.parse({ itemId: "sabotage-device", stat: "hashRate" }),
    ).toThrow();
    expect(() =>
      socialActionInput.parse({
        target: "",
        itemId: "sabotage-device",
        stat: "hashRate",
      }),
    ).toThrow();
    expect(() =>
      socialActionInput.parse({
        target: "0xT",
        itemId: "nope",
        stat: "hashRate",
      }),
    ).toThrow();
    expect(() =>
      socialActionInput.parse({ target: "0xT", itemId: "sabotage-device" }),
    ).toThrow();
    expect(() =>
      socialActionInput.parse({
        target: "0xT",
        itemId: "sabotage-device",
        stat: "exploit",
      }),
    ).toThrow();
  });
});

describe("sabotageTarget", () => {
  it("consumes one item and sets the chosen stat's effect with a server-rolled strength", async () => {
    seed({ "sabotage-device": 2 });
    const { strengthMin: min, strengthMax: max } = SOCIAL_ECONOMY.statEffects;

    const result = await sabotageTarget(
      CALLER,
      TARGET,
      "sabotage-device",
      "hashRate",
    );

    expect(result).toMatchObject({
      ok: true,
      itemId: "sabotage-device",
      target: TARGET,
      stat: "hashRate",
    });
    expect(fixtureItemQuantities(CALLER)["sabotage-device"]).toBe(1);
    const stored = player(TARGET).statEffects?.hashRate;
    expect(stored).toMatchObject({
      stat: "hashRate",
      active: true,
      itemId: "sabotage-device",
      appliedBy: CALLER,
      helps: [],
    });
    expect(stored?.appliedAt).toEqual(expect.any(Number));
    expect(stored?.strength).toBeGreaterThanOrEqual(min);
    expect(stored?.strength).toBeLessThanOrEqual(1);
    expect(result.effect).toEqual(stored);
    expect(player(TARGET).statEffects?.hackPower).toBeUndefined();
    expect(player(TARGET).statEffects?.security).toBeUndefined();
    expect(max).toBeGreaterThan(0);
  });

  it("uses the injected rng for the rolled strength", async () => {
    seed();
    const { strengthMin: min } = SOCIAL_ECONOMY.statEffects;

    const result = await sabotageTarget(
      CALLER,
      TARGET,
      "sabotage-device",
      "security",
      () => 0,
    );

    expect(result.effect?.strength).toBeGreaterThanOrEqual(min);
    expect(result.effect?.strength).toBeLessThanOrEqual(min * 2);
  });

  it("rejects a second sabotage on the same stat and does not consume the item", async () => {
    seed({ "sabotage-device": 2 });
    await sabotageTarget(CALLER, TARGET, "sabotage-device", "hashRate");

    const second = await sabotageTarget(
      CALLER,
      TARGET,
      "sabotage-device",
      "hashRate",
    );

    expect(second).toMatchObject({ ok: false, code: "already_sabotaged" });
    expect(fixtureItemQuantities(CALLER)["sabotage-device"]).toBe(1);
  });

  it("allows sabotage on a different stat of the same target", async () => {
    seed({ "sabotage-device": 2 });
    await sabotageTarget(CALLER, TARGET, "sabotage-device", "hashRate");

    const other = await sabotageTarget(
      CALLER,
      TARGET,
      "sabotage-device",
      "security",
    );

    expect(other).toMatchObject({ ok: true, stat: "security" });
    expect(player(TARGET).statEffects?.hashRate?.active).toBe(true);
    expect(player(TARGET).statEffects?.security?.active).toBe(true);
    expect(fixtureItemQuantities(CALLER)["sabotage-device"]).toBe(0);
  });

  it("rejects an unsupported stat without consuming", async () => {
    seed();

    const result = await sabotageTarget(
      CALLER,
      TARGET,
      "sabotage-device",
      "exploit" as never,
    );

    expect(result).toMatchObject({ ok: false, code: "invalid_stat" });
    expect(fixtureItemQuantities(CALLER)["sabotage-device"]).toBe(1);
  });

  it("rejects self-targeting without consuming", async () => {
    seed();

    const result = await sabotageTarget(
      CALLER,
      CALLER,
      "sabotage-device",
      "hashRate",
    );

    expect(result).toMatchObject({ ok: false, code: "self_target" });
    expect(fixtureItemQuantities(CALLER)["sabotage-device"]).toBe(1);
    expect(player(CALLER).statEffects).toBeFalsy();
  });

  it("rejects when the caller owns none", async () => {
    seed({});

    const result = await sabotageTarget(
      CALLER,
      TARGET,
      "sabotage-device",
      "hashRate",
    );

    expect(result).toMatchObject({ ok: false, code: "no_item" });
    expect(player(TARGET).statEffects).toBeFalsy();
  });

  it("rejects an unknown target", async () => {
    seed();

    const result = await sabotageTarget(
      CALLER,
      "0xNOBODY",
      "sabotage-device",
      "hashRate",
    );

    expect(result).toMatchObject({ ok: false, code: "target_not_found" });
    expect(fixtureItemQuantities(CALLER)["sabotage-device"]).toBe(1);
  });

  it("rejects a help-kit used as sabotage and keeps it", async () => {
    seed({ "help-kit": 1 });

    const result = await sabotageTarget(CALLER, TARGET, "help-kit", "hashRate");

    expect(result).toMatchObject({ ok: false, code: "wrong_item_kind" });
    expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(1);
  });

  it("rejects a target that is currently protected", async () => {
    seed();
    player(TARGET).protectionUntil = Date.now() + 60_000;

    const result = await sabotageTarget(
      CALLER,
      TARGET,
      "sabotage-device",
      "hashRate",
    );

    expect(result).toMatchObject({ ok: false, code: "target_protected" });
    expect(fixtureItemQuantities(CALLER)["sabotage-device"]).toBe(1);
  });

  it("concurrent duplicate requests change state once and consume one item", async () => {
    seed({ "sabotage-device": 3 });

    const results = await Promise.all([
      sabotageTarget(CALLER, TARGET, "sabotage-device", "hashRate"),
      sabotageTarget(CALLER, TARGET, "sabotage-device", "hashRate"),
      sabotageTarget(CALLER, TARGET, "sabotage-device", "hashRate"),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(fixtureItemQuantities(CALLER)["sabotage-device"]).toBe(2);
    expect(player(TARGET).statEffects?.hashRate?.active).toBe(true);
  });

  it("different callers racing for one target: exactly one wins and the loser keeps the item", async () => {
    seed();
    seedFixturePlayer({
      wallet: "0xOTHER",
    });
    seedFixtureInventory("0xOTHER", { "sabotage-device": 1 });

    const results = await Promise.all([
      sabotageTarget(CALLER, TARGET, "sabotage-device", "hashRate"),
      sabotageTarget("0xOTHER", TARGET, "sabotage-device", "hashRate"),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const owned =
      (fixtureItemQuantities(CALLER)["sabotage-device"] ?? 0) +
      (fixtureItemQuantities("0xOTHER")["sabotage-device"] ?? 0);
    expect(owned).toBe(1);
  });

  it("restores the item when applying the state fails", async () => {
    seed();
    vi.spyOn(
      getFixtureRepositories().players,
      "applyStatSabotage",
    ).mockResolvedValueOnce({
      ok: false,
    });

    const result = await sabotageTarget(
      CALLER,
      TARGET,
      "sabotage-device",
      "hashRate",
    );

    expect(result.ok).toBe(false);
    expect(fixtureItemQuantities(CALLER)["sabotage-device"]).toBe(1);
  });

  it("does not restore an item after an unknown effect-write outcome", async () => {
    seed();
    vi.spyOn(
      getFixtureRepositories().players,
      "applyStatSabotage",
    ).mockRejectedValueOnce(new Error("db down"));

    await expect(
      sabotageTarget(CALLER, TARGET, "sabotage-device", "hashRate"),
    ).rejects.toThrow("db down");

    expect(fixtureItemQuantities(CALLER)["sabotage-device"]).toBe(0);
  });

  it("releases the duplicate guard after a failure so a retry can succeed", async () => {
    seed();
    vi.spyOn(
      getFixtureRepositories().players,
      "applyStatSabotage",
    ).mockResolvedValueOnce({ ok: false });
    expect(
      (await sabotageTarget(CALLER, TARGET, "sabotage-device", "hashRate")).ok,
    ).toBe(false);

    const retry = await sabotageTarget(
      CALLER,
      TARGET,
      "sabotage-device",
      "hashRate",
    );

    expect(retry.ok).toBe(true);
  });

  it("rate limits a caller who exceeds the window", async () => {
    seedFixturePlayer({
      wallet: CALLER,
    });
    seedFixtureInventory(CALLER, { "sabotage-device": 99 });
    const { maxActionsPerWindow } = SOCIAL_ECONOMY.socialActionLimits;
    for (let i = 0; i < maxActionsPerWindow; i++) {
      seedFixturePlayer({ wallet: `0xT${i}` });
      const ok = await sabotageTarget(
        CALLER,
        `0xT${i}`,
        "sabotage-device",
        "hashRate",
      );
      expect(ok.ok).toBe(true);
    }
    seedFixturePlayer({ wallet: "0xONEMORE" });

    const blocked = await sabotageTarget(
      CALLER,
      "0xONEMORE",
      "sabotage-device",
      "hashRate",
    );

    expect(blocked).toMatchObject({ ok: false, code: "rate_limited" });
    expect(fixtureItemQuantities(CALLER)["sabotage-device"]).toBe(
      99 - maxActionsPerWindow,
    );
  });

  it("awards no Notoriety, XP or HASH and writes a log", async () => {
    seed();
    const before = {
      n: player(CALLER).notoriety,
      xp: player(CALLER).xp,
      hash: player(CALLER).hash,
    };

    await sabotageTarget(CALLER, TARGET, "sabotage-device", "hashRate");

    expect(player(CALLER)).toMatchObject({
      notoriety: before.n,
      xp: before.xp,
      hash: before.hash,
    });
    expect(getFixtureState().logs[0]).toMatchObject({
      type: "sabotage",
      wallet: CALLER,
      data: { target: TARGET, itemId: "sabotage-device", stat: "hashRate" },
    });
  });

  it("records source, target and stat on the audit row and tells the target which stat", async () => {
    seed();

    await sabotageTarget(CALLER, TARGET, "sabotage-device", "security");

    expect(getFixtureState().logs[0]).toMatchObject({
      type: "sabotage",
      wallet: CALLER,
      target: TARGET,
      data: { stat: "security" },
    });
    const inbox = await getFixtureRepositories()
      .logs.listHistory(TARGET, { limit: 10 })
      .then((page) => page.logs);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].data?.stat).toBe("security");
  });

  it("reports interrupted sabotage writes without rolling back its effects", async () => {
    seed();
    const before = structuredClone(fixtureItemQuantities(CALLER));
    vi.spyOn(getFixtureRepositories().logs, "create").mockRejectedValueOnce(
      new Error("log down"),
    );
    await expect(
      getFixtureRepositories().transaction(() =>
        sabotageTarget(CALLER, TARGET, "sabotage-device", "hashRate"),
      ),
    ).rejects.toThrow("operator review");
    expect(player(TARGET).statEffects?.hashRate).toBeDefined();
    expect(fixtureItemQuantities(CALLER)).not.toEqual(before);
    expect(
      await getFixtureRepositories()
        .logs.listHistory(TARGET, { limit: 10 })
        .then((page) => page.logs),
    ).toHaveLength(0);
  });

  it("sends one history entry per stat when the same target is sabotaged on two stats", async () => {
    seed({ "sabotage-device": 2 });

    await sabotageTarget(CALLER, TARGET, "sabotage-device", "hashRate");
    resetSocialGuards();
    await sabotageTarget(CALLER, TARGET, "sabotage-device", "security");

    const inbox = await getFixtureRepositories()
      .logs.listHistory(TARGET, { limit: 10 })
      .then((page) => page.logs);
    expect(inbox).toHaveLength(2);
  });
});
vi.mock("@/lib/modules/players/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/players/server.repository")
  >()),
  get playerRepository() {
    return getFixtureRepositories().players;
  },
}));
vi.mock("@/lib/modules/logs/server.repository", async (original) => ({
  ...(await original<typeof import("@/lib/modules/logs/server.repository")>()),
  get logRepository() {
    return getFixtureRepositories().logs;
  },
}));
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

describe("sabotage Luck failure", () => {
  it.each([[0, 0.249999, true], [0, 0.25, false], [1, 0.2501, true], [1, 0.25025, false]] as const)(
    "adds the base once with stake %s and roll %s", async (stake, roll, success) => {
      seed();
      player(CALLER).vaultStaked = stake;
      // Stale stored totals must not authorize a social roll.
      player(CALLER).stats.luck = 99;
      const rng = vi.fn().mockReturnValueOnce(roll).mockReturnValue(0.5);
      const result = await sabotageTarget(CALLER, TARGET, "sabotage-device", "hashRate", rng);
      expect(result).toMatchObject({ ok: true, success, itemConsumed: true });
      expect(fixtureItemQuantities(CALLER)["sabotage-device"]).toBe(0);
      expect(rng).toHaveBeenCalledTimes(success ? 2 : 1);
    },
  );

  it("rejects invalid authoritative stats before consuming an item or drawing", async () => {
    seed();
    player(CALLER).statLevels.hashRate = NaN;
    const before = structuredClone(player(TARGET).statEffects);
    const rng = vi.fn(() => 0);
    await expect(sabotageTarget(CALLER, TARGET, "sabotage-device", "hashRate", rng)).rejects.toThrow("Invalid player stat input");
    expect(fixtureItemQuantities(CALLER)["sabotage-device"]).toBe(1);
    expect(player(TARGET).statEffects).toEqual(before);
    expect(rng).not.toHaveBeenCalled();
    expect(getFixtureState().logs).toHaveLength(0);
  });
  it("consumes exactly one item, preserves target effects and records a completed failed roll", async () => {
    seed({ "sabotage-device": 2 });
    const effectsBefore = structuredClone(player(TARGET).statEffects);
    const result = await sabotageTarget(CALLER, TARGET, "sabotage-device", "hashRate", () => 0.99);
    expect(result).toMatchObject({ ok: true, success: false, itemConsumed: true });
    expect(fixtureItemQuantities(CALLER)["sabotage-device"]).toBe(1);
    expect(player(TARGET).statEffects).toEqual(effectsBefore);
    expect(getFixtureState().logs.at(-1)).toMatchObject({
      type: "sabotage", data: { success: false, itemConsumed: true, strength: 0, critical: false },
    });
  });
});
