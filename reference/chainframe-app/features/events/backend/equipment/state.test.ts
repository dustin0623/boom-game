vi.mock("@/features/events/backend/tick-player/action", () => ({ settleTick: vi.fn(async () => {}) }));
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  equip: vi.fn(),
  unequip: vi.fn(),
  player: vi.fn(),
  setSlot: vi.fn(),
}));
vi.mock("@/lib/modules/equipments/server.repository", () => ({
  equipmentRepository: { equip: state.equip, unequip: state.unequip },
}));
vi.mock("@/lib/modules/players/server.repository", () => ({
  playerRepository: { findByWallet: state.player, setEquipment: state.setSlot },
}));
import { equipItem } from "./equip";
import { unequipItem } from "./unequip";
beforeEach(() => {
  vi.resetAllMocks();
  state.equip.mockResolvedValue({
    ok: true,
    item: { id: "new", slot: "asicMiner" },
  });
  state.unequip.mockResolvedValue({
    ok: true,
    item: { id: "old", slot: "asicMiner" },
  });
});
describe("equipment player-slot coordination", () => {
  it("points the slot at the repository's newly equipped item", async () => {
    const result = await equipItem("alice", "new");
    expect(result.ok).toBe(true);
    expect(state.equip).toHaveBeenCalledWith("new", "alice");
    expect(state.setSlot).toHaveBeenCalledWith("alice", "asicMiner", "new");
  });
  it("does not change player slots for a rejected item mutation", async () => {
    state.equip.mockResolvedValue({ ok: false, error: "Item reserved" });
    expect(await equipItem("alice", "new")).toMatchObject({ ok: false });
    state.unequip.mockResolvedValue({ ok: false, error: "Item not found" });
    expect(await unequipItem("alice", "old")).toMatchObject({ ok: false });
    expect(state.setSlot).not.toHaveBeenCalled();
    expect(state.player).not.toHaveBeenCalled();
  });
  it("clears only a slot still referring to the unequipped item", async () => {
    state.player.mockResolvedValue({ equipment: { asicMiner: "old" } });
    await unequipItem("alice", "old");
    expect(state.setSlot).toHaveBeenCalledWith("alice", "asicMiner", null);
  });
  it.each([null, { equipment: { asicMiner: "replacement" } }])(
    "preserves a missing player or replacement slot",
    async (player) => {
      state.player.mockResolvedValue(player);
      await unequipItem("alice", "old");
      expect(state.setSlot).not.toHaveBeenCalled();
    },
  );
  it("propagates a player-write interruption without pretending the item change rolled back", async () => {
    state.setSlot.mockRejectedValue(new Error("interrupted"));
    await expect(equipItem("alice", "new")).rejects.toThrow("interrupted");
    expect(state.equip).toHaveBeenCalledOnce();
    expect(state.unequip).not.toHaveBeenCalled();
  });
});
