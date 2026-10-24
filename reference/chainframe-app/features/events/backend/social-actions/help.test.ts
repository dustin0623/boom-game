import {
  fixtureItemQuantities,
  seedFixtureInventory,
} from "@/tests/fixtures/persistence/store";
import {
  socialActionInput,
  type StatEffectTarget,
} from "@/features/types/game/consumables";
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
import type { Rng } from "@/features/types/game/exposure";
import {
  netEffectStrength,
  type StatEffect,
} from "@/features/types/game/stat-effects";

import { helpTarget } from "./help";

const CALLER = "0xCALLER";
const TARGET = "0xTARGET";

const player = (wallet: string) => getFixtureState().players.get(wallet)!;

const sabotageEffect = (
  stat: StatEffectTarget,
  strength = 0.5,
): StatEffect => ({
  stat,
  itemId: "sabotage-device",
  appliedBy: "0xATTACKER",
  appliedAt: 1,
  active: true,
  strength,
  critical: false,
  helps: [],
});

/** Luck succeeds, then effect strength lands at the midpoint. */
const noCritRng = (): Rng => {
  let calls = 0;
  return () => (calls++ % 2 === 0 ? 0 : 0.5);
};
const { strengthMin, strengthMax } = SOCIAL_ECONOMY.statEffects;
const midStrength = (strengthMin + strengthMax) / 2;

function seed(
  consumables: Record<string, number> = { "help-kit": 1 },
  effects: StatEffect[] = [sabotageEffect("hashRate")],
) {
  seedFixturePlayer({ wallet: CALLER });
  seedFixtureInventory(CALLER, consumables);
  seedFixturePlayer({
    wallet: TARGET,
    statEffects: Object.fromEntries(
      effects.map((effect) => [effect.stat, effect]),
    ),
  });
}

beforeEach(() => {
  resetFixtureDatabase();
  resetSocialGuards();
  vi.restoreAllMocks();
  vi.spyOn(Math, "random").mockReturnValue(0.1);
});

describe("useHelpInput", () => {
  it("accepts a target, a known item and a stat and strips everything else", () => {
    expect(
      socialActionInput.parse({
        target: "0xT",
        itemId: "help-kit",
        stat: "hackPower",
        strength: 1,
        isSabotaged: true,
        appliedBy: "0xEVIL",
      }),
    ).toEqual({ target: "0xT", itemId: "help-kit", stat: "hackPower" });
  });

  it("rejects a missing target, unknown item, or missing/unknown stat", () => {
    expect(() =>
      socialActionInput.parse({ itemId: "help-kit", stat: "hashRate" }),
    ).toThrow();
    expect(() =>
      socialActionInput.parse({
        target: "",
        itemId: "help-kit",
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
      socialActionInput.parse({ target: "0xT", itemId: "help-kit" }),
    ).toThrow();
    expect(() =>
      socialActionInput.parse({
        target: "0xT",
        itemId: "help-kit",
        stat: "vault",
      }),
    ).toThrow();
  });
});

describe("helpTarget", () => {
  it.each(["hashRate", "security"] as const)(
    "blocks helping %s while any own sabotage remains, without consuming or logging",
    async (stat) => {
      seed({ "help-kit": 1 }, [
        { ...sabotageEffect("hashRate"), appliedBy: CALLER },
        sabotageEffect("security"),
      ]);
      const before = structuredClone(player(TARGET).statEffects);
      const result = await helpTarget(CALLER, TARGET, "help-kit", stat);
      expect(result).toMatchObject({
        ok: false,
        code: "own_sabotage",
        error: "You cannot help a player you have sabotaged.",
      });
      expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(1);
      expect(player(TARGET).statEffects).toEqual(before);
      expect(getFixtureState().logs).toHaveLength(0);
    },
  );

  it("keeps blocking until every own effect is countered or cleared", async () => {
    const own = {
      ...sabotageEffect("hashRate"),
      appliedBy: CALLER,
      helps: [
        {
          itemId: "help-kit" as const,
          appliedBy: "other",
          appliedAt: 2,
          strength: 0.2,
          critical: false,
        },
      ],
    };
    seed({ "help-kit": 2 }, [own, sabotageEffect("security")]);
    expect(
      await helpTarget(CALLER, TARGET, "help-kit", "security"),
    ).toMatchObject({ ok: false, code: "own_sabotage" });
    player(TARGET).statEffects!.hashRate!.helps[0].strength = 0.5;
    player(TARGET).statEffects!.hackPower = {
      ...sabotageEffect("hackPower"),
      appliedBy: CALLER,
    };
    expect(
      await helpTarget(CALLER, TARGET, "help-kit", "security"),
    ).toMatchObject({ ok: false, code: "own_sabotage" });
    delete player(TARGET).statEffects!.hackPower;
    expect(
      await helpTarget(CALLER, TARGET, "help-kit", "security", noCritRng()),
    ).toMatchObject({ ok: true });
  });

  it("allows another player to counter the caller's sabotage", async () => {
    seed({ "help-kit": 1 }, [
      { ...sabotageEffect("hashRate"), appliedBy: "another-player" },
    ]);
    expect(
      await helpTarget(CALLER, TARGET, "help-kit", "hashRate", noCritRng()),
    ).toMatchObject({ ok: true });
  });

  it("counters part of a sabotaged stat with a server-rolled strength and consumes one item", async () => {
    seed({ "help-kit": 2 });

    const result = await helpTarget(
      CALLER,
      TARGET,
      "help-kit",
      "hashRate",
      noCritRng(),
    );

    expect(result).toMatchObject({
      ok: true,
      itemId: "help-kit",
      target: TARGET,
      stat: "hashRate",
    });
    expect(result.strength).toBeCloseTo(midStrength, 6);
    expect(result.remainingStrength).toBeCloseTo(0.5 - midStrength, 6);
    expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(1);

    const stored = player(TARGET).statEffects?.hashRate;
    expect(stored?.helps).toHaveLength(1);
    expect(stored?.helps[0]).toMatchObject({
      itemId: "help-kit",
      appliedBy: CALLER,
      critical: false,
    });
    expect(stored?.active).toBe(true);
    expect(result.effect).toEqual(stored);
  });

  it("fully counters a weak Sabotage and marks the effect inactive", async () => {
    seed({ "help-kit": 1 }, [sabotageEffect("hashRate", 0.1)]);

    const result = await helpTarget(
      CALLER,
      TARGET,
      "help-kit",
      "hashRate",
      noCritRng(),
    );

    expect(result).toMatchObject({ ok: true, remainingStrength: 0 });
    expect(netEffectStrength(player(TARGET).statEffects?.hashRate)).toBe(0);
    expect(player(TARGET).statEffects?.hashRate?.active).toBe(false);
  });

  it("only changes the chosen stat and never touches base stat levels", async () => {
    seed({ "help-kit": 1 }, [
      sabotageEffect("hashRate"),
      sabotageEffect("security", 0.4),
    ]);
    const levelsBefore = { ...player(TARGET).statLevels };
    const securityBefore = structuredClone(
      player(TARGET).statEffects?.security,
    );

    await helpTarget(CALLER, TARGET, "help-kit", "hashRate", noCritRng());

    expect(player(TARGET).statEffects?.security).toEqual(securityBefore);
    expect(player(TARGET).statEffects?.hashRate?.helps).toHaveLength(1);
    expect(player(TARGET).statLevels).toEqual(levelsBefore);
  });

  it("rejects help on a stat with no Sabotage even when another stat is sabotaged, and keeps the item", async () => {
    seed({ "help-kit": 1 }, [sabotageEffect("security")]);

    const result = await helpTarget(CALLER, TARGET, "help-kit", "hackPower");

    expect(result).toMatchObject({ ok: false, code: "not_sabotaged" });
    expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(1);
    expect(player(TARGET).statEffects?.security?.helps).toHaveLength(0);
  });

  it("rejects help on a target with no effects at all", async () => {
    seed({ "help-kit": 1 }, []);

    const result = await helpTarget(CALLER, TARGET, "help-kit", "hashRate");

    expect(result).toMatchObject({ ok: false, code: "not_sabotaged" });
    expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(1);
  });

  it("rejects help on a stat that is already fully countered", async () => {
    seed({ "help-kit": 2 }, [sabotageEffect("hashRate", 0.1)]);
    await helpTarget(CALLER, TARGET, "help-kit", "hashRate", noCritRng());

    const second = await helpTarget(
      CALLER,
      TARGET,
      "help-kit",
      "hashRate",
      noCritRng(),
    );

    expect(second).toMatchObject({ ok: false, code: "not_sabotaged" });
    expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(1);
  });

  it("lets a second Help build on the first until the Sabotage is gone", async () => {
    seed({ "help-kit": 3 }, [sabotageEffect("hashRate", 0.5)]);

    // 0.5 roll gives the midpoint (0.3 with the default range), so two Helps clear 0.5.
    await helpTarget(CALLER, TARGET, "help-kit", "hashRate", noCritRng());
    resetSocialGuards();
    const second = await helpTarget(
      CALLER,
      TARGET,
      "help-kit",
      "hashRate",
      noCritRng(),
    );

    expect(second.ok).toBe(true);
    expect(player(TARGET).statEffects?.hashRate?.helps).toHaveLength(2);
    expect(
      netEffectStrength(player(TARGET).statEffects?.hashRate),
    ).toBeLessThan(0.5 - midStrength);
  });

  it("rejects self-help without consuming", async () => {
    seed();
    player(CALLER).statEffects = { hashRate: sabotageEffect("hashRate") };

    const result = await helpTarget(CALLER, CALLER, "help-kit", "hashRate");

    expect(result).toMatchObject({ ok: false, code: "self_target" });
    expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(1);
    expect(player(CALLER).statEffects?.hashRate?.helps).toHaveLength(0);
  });

  it("rejects when the caller owns none", async () => {
    seed({});

    const result = await helpTarget(CALLER, TARGET, "help-kit", "hashRate");

    expect(result).toMatchObject({ ok: false, code: "no_item" });
    expect(player(TARGET).statEffects?.hashRate?.helps).toHaveLength(0);
  });

  it("rejects an unknown target and an unsupported stat without consuming", async () => {
    seed();

    expect(
      await helpTarget(CALLER, "0xNOBODY", "help-kit", "hashRate"),
    ).toMatchObject({
      ok: false,
      code: "target_not_found",
    });
    expect(
      await helpTarget(CALLER, TARGET, "help-kit", "vault" as never),
    ).toMatchObject({
      ok: false,
      code: "invalid_stat",
    });
    expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(1);
  });

  it("rejects a sabotage-device used as help and keeps it", async () => {
    seed({ "sabotage-device": 1 });

    const result = await helpTarget(
      CALLER,
      TARGET,
      "sabotage-device",
      "hashRate",
    );

    expect(result).toMatchObject({ ok: false, code: "wrong_item_kind" });
    expect(fixtureItemQuantities(CALLER)["sabotage-device"]).toBe(1);
  });

  it("concurrent duplicate requests change state once and consume one item", async () => {
    seed({ "help-kit": 3 });

    const results = await Promise.all([
      helpTarget(CALLER, TARGET, "help-kit", "hashRate"),
      helpTarget(CALLER, TARGET, "help-kit", "hashRate"),
      helpTarget(CALLER, TARGET, "help-kit", "hashRate"),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(2);
    expect(player(TARGET).statEffects?.hashRate?.helps).toHaveLength(1);
  });

  it("different callers racing on one stat never spend an item without a stored Help", async () => {
    seed();
    seedFixturePlayer({ wallet: "0xOTHER" });
    seedFixtureInventory("0xOTHER", { "help-kit": 1 });

    const results = await Promise.all([
      helpTarget(CALLER, TARGET, "help-kit", "hashRate"),
      helpTarget("0xOTHER", TARGET, "help-kit", "hashRate"),
    ]);

    const wins = results.filter((r) => r.ok).length;
    const owned =
      (fixtureItemQuantities(CALLER)["help-kit"] ?? 0) +
      (fixtureItemQuantities("0xOTHER")["help-kit"] ?? 0);
    expect(wins).toBeGreaterThanOrEqual(1);
    expect(owned).toBe(2 - wins);
    expect(player(TARGET).statEffects?.hashRate?.helps).toHaveLength(wins);
  });

  it("restores the item when the effect changed after it was read", async () => {
    seed();
    vi.spyOn(
      getFixtureRepositories().players,
      "replaceStatEffect",
    ).mockResolvedValueOnce({
      ok: false,
    });

    const result = await helpTarget(CALLER, TARGET, "help-kit", "hashRate");

    expect(result).toMatchObject({ ok: false, code: "already_helped" });
    expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(1);
    expect(player(TARGET).statEffects?.hashRate?.helps).toHaveLength(0);
  });

  it("does not restore an item after an unknown effect-write outcome", async () => {
    seed();
    vi.spyOn(
      getFixtureRepositories().players,
      "replaceStatEffect",
    ).mockRejectedValueOnce(new Error("db down"));

    await expect(
      helpTarget(CALLER, TARGET, "help-kit", "hashRate"),
    ).rejects.toThrow("db down");

    expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(0);
  });

  it("releases the duplicate guard after a failure so a retry can succeed", async () => {
    seed();
    vi.spyOn(
      getFixtureRepositories().players,
      "replaceStatEffect",
    ).mockResolvedValueOnce({ ok: false });
    expect((await helpTarget(CALLER, TARGET, "help-kit", "hashRate")).ok).toBe(
      false,
    );

    const retry = await helpTarget(CALLER, TARGET, "help-kit", "hashRate");

    expect(retry.ok).toBe(true);
  });

  it("rate limits a caller who exceeds the window", async () => {
    seedFixturePlayer({ wallet: CALLER });
    seedFixtureInventory(CALLER, { "help-kit": 99 });
    const { maxActionsPerWindow } = SOCIAL_ECONOMY.socialActionLimits;
    for (let i = 0; i < maxActionsPerWindow; i++) {
      seedFixturePlayer({
        wallet: `0xT${i}`,
        statEffects: { hashRate: sabotageEffect("hashRate") },
      });
      const ok = await helpTarget(CALLER, `0xT${i}`, "help-kit", "hashRate");
      expect(ok.ok).toBe(true);
    }
    seedFixturePlayer({
      wallet: "0xONEMORE",
      statEffects: { hashRate: sabotageEffect("hashRate") },
    });

    const blocked = await helpTarget(
      CALLER,
      "0xONEMORE",
      "help-kit",
      "hashRate",
    );

    expect(blocked).toMatchObject({ ok: false, code: "rate_limited" });
    expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(
      99 - maxActionsPerWindow,
    );
  });

  it("awards no Notoriety, XP or HASH, writes a log and records history the target", async () => {
    seed();
    const before = {
      n: player(CALLER).notoriety,
      xp: player(CALLER).xp,
      hash: player(CALLER).hash,
    };

    await helpTarget(CALLER, TARGET, "help-kit", "hashRate", noCritRng());

    expect(player(CALLER)).toMatchObject({
      notoriety: before.n,
      xp: before.xp,
      hash: before.hash,
    });
    expect(getFixtureState().logs[0]).toMatchObject({
      type: "help",
      wallet: CALLER,
      data: {
        target: TARGET,
        itemId: "help-kit",
        stat: "hashRate",
        sabotagedBy: "0xATTACKER",
      },
    });
    const inbox = await getFixtureRepositories()
      .logs.listHistory(TARGET, { limit: 10 })
      .then((page) => page.logs);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].data?.stat).toBe("hashRate");
  });

  it("records the target on the audit row", async () => {
    seed();

    await helpTarget(CALLER, TARGET, "help-kit", "hashRate", noCritRng());

    expect(getFixtureState().logs[0]).toMatchObject({
      type: "help",
      wallet: CALLER,
      target: TARGET,
    });
  });

  it("reports interrupted Help writes without rolling back item consumption", async () => {
    seed();
    const before = structuredClone(fixtureItemQuantities(CALLER));
    vi.spyOn(getFixtureRepositories().logs, "create").mockRejectedValueOnce(
      new Error("log down"),
    );
    await expect(
      getFixtureRepositories().transaction(() =>
        helpTarget(CALLER, TARGET, "help-kit", "hashRate", noCritRng()),
      ),
    ).rejects.toThrow("operator review");
    expect(fixtureItemQuantities(CALLER)).not.toEqual(before);
    expect(player(TARGET).statEffects?.hashRate?.helps).toHaveLength(1);
    expect(
      await getFixtureRepositories()
        .logs.listHistory(TARGET, { limit: 10 })
        .then((page) => page.logs),
    ).toHaveLength(0);
  });

  it("records history for each Help even when two land in the same millisecond", async () => {
    seed({ "help-kit": 1 }, [sabotageEffect("hashRate", 0.9)]);
    seedFixturePlayer({ wallet: "0xOTHER" });
    seedFixtureInventory("0xOTHER", { "help-kit": 1 });
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);

    await helpTarget(CALLER, TARGET, "help-kit", "hashRate", noCritRng());
    await helpTarget("0xOTHER", TARGET, "help-kit", "hashRate", noCritRng());

    expect(player(TARGET).statEffects?.hashRate?.helps).toHaveLength(2);
    expect(
      await getFixtureRepositories()
        .logs.listHistory(TARGET, { limit: 10 })
        .then((page) => page.logs),
    ).toHaveLength(2);
  });

  it("cannot revive a cleared effect from a stale read", async () => {
    const stale = sabotageEffect("hashRate");
    seed({ "help-kit": 1 }, [stale]);
    await getFixtureRepositories().players.clearStatEffects(TARGET);

    const revived = await getFixtureRepositories().players.replaceStatEffect(
      TARGET,
      stale,
      {
        ...stale,
        helps: [
          {
            itemId: "help-kit",
            appliedBy: CALLER,
            appliedAt: 2,
            strength: 0.1,
            critical: false,
          },
        ],
      },
    );
    const viaAction = await helpTarget(CALLER, TARGET, "help-kit", "hashRate");

    expect(revived.ok).toBe(false);
    expect(viaAction).toMatchObject({ ok: false, code: "not_sabotaged" });
    expect(player(TARGET).statEffects?.hashRate).toBeUndefined();
    expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(1);
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

describe("help Luck failure", () => {
  it.each([[0, 0.249999, true], [0, 0.25, false], [1, 0.2501, true], [1, 0.25025, false]] as const)(
    "adds the base once with stake %s and roll %s", async (stake, roll, success) => {
      seed();
      player(CALLER).vaultStaked = stake;
      // Stale stored totals must not authorize a social roll.
      player(CALLER).stats.luck = 99;
      const rng = vi.fn().mockReturnValueOnce(roll).mockReturnValue(0.5);
      const result = await helpTarget(CALLER, TARGET, "help-kit", "hashRate", rng);
      expect(result).toMatchObject({ ok: true, success, itemConsumed: true });
      expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(0);
      expect(rng).toHaveBeenCalledTimes(success ? 2 : 1);
    },
  );

  it("rejects invalid authoritative stats before consuming an item or drawing", async () => {
    seed();
    player(CALLER).statLevels.hashRate = NaN;
    const before = structuredClone(player(TARGET).statEffects);
    const rng = vi.fn(() => 0);
    await expect(helpTarget(CALLER, TARGET, "help-kit", "hashRate", rng)).rejects.toThrow("Invalid player stat input");
    expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(1);
    expect(player(TARGET).statEffects).toEqual(before);
    expect(rng).not.toHaveBeenCalled();
    expect(getFixtureState().logs).toHaveLength(0);
  });
  it("consumes exactly one item, preserves target effects and records a completed failed roll", async () => {
    seed({ "help-kit": 2 });
    const effectsBefore = structuredClone(player(TARGET).statEffects);
    const result = await helpTarget(CALLER, TARGET, "help-kit", "hashRate", () => 0.99);
    expect(result).toMatchObject({ ok: true, success: false, itemConsumed: true });
    expect(fixtureItemQuantities(CALLER)["help-kit"]).toBe(1);
    expect(player(TARGET).statEffects).toEqual(effectsBefore);
    expect(getFixtureState().logs.at(-1)).toMatchObject({
      type: "help", data: { success: false, itemConsumed: true, strength: 0, critical: false },
    });
  });
});
