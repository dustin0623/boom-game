import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  state: {
    mode: "wallet",
    address: "alice",
    connectedAt: 1,
    apiConnected: true,
  },
  player: vi.fn(),
  inventory: vi.fn(),
}));
vi.mock("./authStore", () => ({
  useAuthStore: { getState: () => auth.state, setState: vi.fn() },
}));
vi.mock("@/lib/api/client", () => ({
  getMe: auth.player,
  getInventory: auth.inventory,
}));
import { usePlayerStore } from "./playerStore";
import { useInventoryStore } from "./inventoryStore";
import type { PlayerDto } from "@/lib/api/types";
const dto = {
  address: "alice",
  hash: 12,
  xp: 0,
  sparks: 0,
  vault: 0.4,
  vaultStaked: 0,
  statLevels: {
    hashRate: 2,
    hackPower: 1,
    security: 1,
    luck: 1,
    firewall: 1,
    exploit: 1,
  },
  lastTickAt: 5000,
  lastSinkAt: 1000,
  claimCharges: 4,
  lastClaimRegenAt: 1000,
  raidCharges: 8,
  lastRaidRegenAt: 1000,
  notoriety: 0,
  isRegistered: true,
} as PlayerDto;
beforeEach(() => {
  vi.clearAllMocks();
  auth.state = {
    mode: "wallet",
    address: "alice",
    connectedAt: 1,
    apiConnected: true,
  };
  usePlayerStore.getState().reset();
  useInventoryStore.getState().reset();
});
describe("transient authoritative gameplay caches", () => {
  it("has no persistence middleware or local gameplay mutation methods", () => {
    expect("persist" in usePlayerStore).toBe(false);
    expect("persist" in useInventoryStore).toBe(false);
    for (const name of [
      "claim",
      "spend",
      "credit",
      "tick",
      "burn",
      "upgradeStat",
    ])
      expect(name in usePlayerStore.getState()).toBe(false);
    for (const name of ["addItem", "equip", "unequip", "salvage"])
      expect(name in useInventoryStore.getState()).toBe(false);
  });
  it("stores the authoritative vault and timestamp and clears on reset", async () => {
    expect(await usePlayerStore.getState().syncFromApi(dto)).toBe(true);
    expect(usePlayerStore.getState()).toMatchObject({
      loaded: true,
      wallet: 12,
      vault: 0.4,
      lastTickAt: 5000,
    });
    usePlayerStore.getState().reset();
    expect(usePlayerStore.getState()).toMatchObject({
      loaded: false,
      wallet: 0,
      vault: 0,
    });
  });
  it.each(["logout", "switch", "reconnect"])(
    "discards player and inventory results after %s",
    async (change) => {
      let player!: (value: unknown) => void,
        inventory!: (value: unknown) => void;
      auth.player.mockReturnValue(
        new Promise((r) => {
          player = r;
        }),
      );
      auth.inventory.mockReturnValue(
        new Promise((r) => {
          inventory = r;
        }),
      );
      const requests = [
        usePlayerStore.getState().syncFromApi(),
        useInventoryStore.getState().syncFromApi(),
      ];
      auth.state = {
        ...auth.state,
        address:
          change === "logout" ? "" : change === "switch" ? "bob" : "alice",
        connectedAt: 2,
      };
      player({ ok: true, player: dto });
      inventory({
        ok: true,
        equipments: [],
        items: [{ itemId: "equipment", quantity: 5 }],
      });
      expect(await Promise.all(requests)).toEqual([false, false]);
      expect(usePlayerStore.getState().loaded).toBe(false);
      expect(useInventoryStore.getState().loaded).toBe(false);
    },
  );
  it("leaves initial caches unavailable after failed requests", async () => {
    auth.player.mockResolvedValue({ ok: false, error: "unavailable" });
    auth.inventory.mockResolvedValue({ ok: false, error: "unavailable" });
    expect(await usePlayerStore.getState().syncFromApi()).toBe(false);
    expect(await useInventoryStore.getState().syncFromApi()).toBe(false);
    expect(usePlayerStore.getState().loaded).toBe(false);
    expect(useInventoryStore.getState().loaded).toBe(false);
  });
  it("publishes equipment and stack snapshots together and never converts missing or malformed stacks into zero", async () => {
    auth.inventory.mockResolvedValue({
      ok: true,
      equipments: [],
      items: [
        { itemId: "equipment", quantity: 2 },
        { itemId: "help-kit", quantity: 1 },
      ],
    });
    expect(await useInventoryStore.getState().syncFromApi()).toBe(true);
    expect(useInventoryStore.getState()).toMatchObject({
      inventory: [],
      items: { equipment: 2, "help-kit": 1 },
      loaded: true,
      error: null,
    });
    for (const items of [
      undefined,
      [{ itemId: "equipment", quantity: 0.5 }],
      [{ itemId: "equipment", quantity: -1 }],
    ]) {
      auth.inventory.mockResolvedValue({ ok: true, equipments: [], items });
      expect(await useInventoryStore.getState().syncFromApi()).toBe(false);
      expect(useInventoryStore.getState().items).toEqual({
        equipment: 2,
        "help-kit": 1,
      });
      expect(useInventoryStore.getState().error).not.toBeNull();
    }
    useInventoryStore.getState().reset();
    expect(useInventoryStore.getState()).toMatchObject({
      inventory: [],
      items: {},
      loaded: false,
    });
  });
});
