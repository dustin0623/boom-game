vi.mock("@/features/events/backend/tick-player/action", () => ({
  settleTick: vi.fn(async () => {}),
}));
// template/features/events/backend/equipment/upgrade.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { upgradeItemInput, upgradeEquipment } from "./upgrade";

vi.mock("@/tests/fixtures/persistence", () => ({
  getFixtureRepositories: vi.fn(),
}));

import { getFixtureRepositories } from "@/tests/fixtures/persistence";

const mockedFindItemById = vi.fn();
const mockedFindPlayer = vi.fn();
const mockedUpgradeItem = vi.fn();
const mockedDebitSparks = vi.fn();
const mockedAddXp = vi.fn();
const mockedCreateLog = vi.fn();

vi.mocked(getFixtureRepositories).mockReturnValue({
  equipments: { findById: mockedFindItemById, upgrade: mockedUpgradeItem },
  players: {
    findByWallet: mockedFindPlayer,
    debitSparks: mockedDebitSparks,
    addXp: mockedAddXp,
  },
  logs: { create: mockedCreateLog },
} as never);

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    owner: "0xWALLET",
    name: "Test Rig",
    level: 1,
    stats: {
      hackPower: 10,
      security: 10,
      hashRate: 0,
      firewall: 0,
      exploit: 0,
      luck: 0,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedFindPlayer.mockResolvedValue({ sparks: 1000 });
});

describe("upgradeItemInput", () => {
  it("requires a non-empty itemId", () => {
    expect(() => upgradeItemInput.parse({ itemId: "" })).toThrow();
    expect(() => upgradeItemInput.parse({})).toThrow();
  });

  it("accepts a valid itemId", () => {
    expect(upgradeItemInput.parse({ itemId: "item-1" })).toEqual({
      itemId: "item-1",
    });
  });
});

describe("upgradeEquipment", () => {
  it("rejects zero-SPARKS and unaffordable bulk requests before any debit or upgrade", async () => {
    mockedFindItemById.mockResolvedValue(makeItem());
    for (const [sparks, levels] of [
      [0, 1],
      [0.5, 2],
    ]) {
      mockedFindPlayer.mockResolvedValue({ sparks });
      expect(await upgradeEquipment("0xWALLET", "item-1", levels)).toEqual({
        ok: false,
        error: "Not enough SPARKS",
      });
    }
    expect(mockedDebitSparks).not.toHaveBeenCalled();
    expect(mockedUpgradeItem).not.toHaveBeenCalled();
    expect(mockedCreateLog).not.toHaveBeenCalled();
  });
  it("errors when the item doesn't exist", async () => {
    mockedFindItemById.mockResolvedValue(null);

    const result = await upgradeEquipment("0xWALLET", "item-1");

    expect(result).toEqual({ ok: false, error: "Item not found" });
    expect(mockedDebitSparks).not.toHaveBeenCalled();
  });

  it("errors when the item belongs to a different wallet", async () => {
    mockedFindItemById.mockResolvedValue(makeItem({ owner: "0xOTHER" }));

    const result = await upgradeEquipment("0xWALLET", "item-1");

    expect(result).toEqual({ ok: false, error: "Item not found" });
    expect(mockedDebitSparks).not.toHaveBeenCalled();
  });

  it("errors when the player doesn't have enough SPARKS", async () => {
    mockedFindItemById.mockResolvedValue(makeItem());
    mockedDebitSparks.mockResolvedValue({ ok: false });

    const result = await upgradeEquipment("0xWALLET", "item-1");

    expect(result).toEqual({ ok: false, error: "Not enough SPARKS" });
    expect(mockedUpgradeItem).not.toHaveBeenCalled();
  });

  it("propagates a failed upgradeItem write without charging XP or logging", async () => {
    mockedFindItemById.mockResolvedValue(makeItem());
    mockedDebitSparks.mockResolvedValue({ ok: true });
    mockedUpgradeItem.mockResolvedValue({ ok: false, error: "Item not found" });

    const result = await upgradeEquipment("0xWALLET", "item-1");

    expect(result).toEqual({ ok: false, error: "Item not found" });
    expect(mockedAddXp).not.toHaveBeenCalled();
    expect(mockedCreateLog).not.toHaveBeenCalled();
  });

  it("debits SPARKS, upgrades the item, awards XP for the salvage-value delta, and logs it", async () => {
    const before = makeItem({
      level: 1,
      stats: {
        hackPower: 10,
        security: 10,
        hashRate: 0,
        firewall: 0,
        exploit: 0,
        luck: 0,
      },
    });
    const after = makeItem({
      level: 2,
      stats: {
        hackPower: 10.5,
        security: 10.5,
        hashRate: 0,
        firewall: 0,
        exploit: 0,
        luck: 0,
      },
    });
    mockedFindItemById.mockResolvedValue(before);
    mockedDebitSparks.mockResolvedValue({ ok: true });
    mockedUpgradeItem.mockResolvedValue({ ok: true, item: after });

    const result = await upgradeEquipment("0xWALLET", "item-1");

    expect(mockedDebitSparks).toHaveBeenCalledWith(
      "0xWALLET",
      expect.any(Number),
    );
    expect(mockedUpgradeItem).toHaveBeenCalledWith("item-1", "0xWALLET");
    expect(result.ok).toBe(true);
    expect(result.cost).toBeGreaterThan(0);
    const cost = result.cost as number;

    // The 0.5 SPARK value increase earns exactly 50 XP.
    expect(mockedAddXp).toHaveBeenCalledExactlyOnceWith("0xWALLET", 50);

    expect(mockedCreateLog).toHaveBeenCalledWith({
      type: "upgrade",
      wallet: "0xWALLET",
      amount: -cost,
      data: { itemId: "item-1", name: "Test Rig", from: 1, to: 2 },
    });
  });

  it("skips the XP award when the upgrade doesn't increase salvage value", async () => {
    const same = makeItem({ level: 1 });
    mockedFindItemById.mockResolvedValue(same);
    mockedDebitSparks.mockResolvedValue({ ok: true });
    mockedUpgradeItem.mockResolvedValue({
      ok: true,
      item: { ...same, level: 2 },
    });

    await upgradeEquipment("0xWALLET", "item-1");

    expect(mockedAddXp).not.toHaveBeenCalled();
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
vi.mock("@/lib/modules/equipments/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/equipments/server.repository")
  >()),
  get equipmentRepository() {
    return getFixtureRepositories().equipments;
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
