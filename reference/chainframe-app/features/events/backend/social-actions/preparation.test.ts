import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  find: vi.fn(),
  lock: vi.fn(),
  allowed: vi.fn(),
  release: vi.fn(),
}));
vi.mock("@/lib/modules/players/server.repository", () => ({
  playerRepository: { findByWallet: state.find },
}));
vi.mock("@/lib/modules/items/server.repository", () => ({
  inventoryItemRepository: { quantity: async () => 1 },
}));
vi.mock("@/lib/utils/game/action-guards.server", () => ({
  acquireSocialLock: state.lock,
  allowSocialAction: state.allowed,
}));
import { withSocialPreparation } from "./preparation";
import { socialActionInput } from "@/features/types/game/consumables";
const input = {
  caller: "alice",
  target: "bob",
  itemId: "help-kit" as const,
  stat: "hashRate" as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  state.lock.mockReturnValue(state.release);
  state.allowed.mockReturnValue(true);
  state.find.mockImplementation(async (wallet: string) => ({
    wallet,
    consumables: { "help-kit": 1, "sabotage-device": 1 },
  }));
});
describe("shared social preparation", () => {
  it("strips supplied authority/strength and keeps the existing trimmed input contract", () => {
    expect(
      socialActionInput.parse({
        target: " bob ",
        itemId: "help-kit",
        stat: "hashRate",
        strength: 1,
        isAdmin: true,
      }),
    ).toEqual({ target: "bob", itemId: "help-kit", stat: "hashRate" });
  });
  it("does not release another action's lock when acquisition fails", async () => {
    state.lock.mockReturnValue(null);
    const execute = vi.fn();
    expect(await withSocialPreparation("help", input, execute)).toMatchObject({
      code: "duplicate_request",
    });
    expect(state.release).not.toHaveBeenCalled();
    expect(state.find).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
  it("retains rate limiting before stat and participant validation", async () => {
    state.allowed.mockReturnValue(false);
    expect(
      await withSocialPreparation(
        "help",
        { ...input, stat: "bad" as never },
        vi.fn(),
      ),
    ).toMatchObject({ code: "rate_limited" });
    expect(state.find).not.toHaveBeenCalled();
    expect(state.release).toHaveBeenCalledOnce();
  });
  it.each(["help", "sabotage"] as const)(
    "preserves the %s self-target error",
    async (kind) => {
      expect(
        await withSocialPreparation(
          kind,
          { ...input, target: "alice" },
          vi.fn(),
        ),
      ).toMatchObject({
        code: "self_target",
        error: `Cannot ${kind} yourself`,
      });
      expect(state.release).toHaveBeenCalledOnce();
    },
  );
  it.each(["read", "effect"])(
    "releases the lock after a %s exception",
    async (failure) => {
      if (failure === "read")
        state.find.mockRejectedValue(new Error("read failed"));
      const execute = vi.fn(async () => {
        throw Error("effect failed");
      });
      await expect(
        withSocialPreparation("help", input, execute),
      ).rejects.toThrow("failed");
      expect(state.release).toHaveBeenCalledOnce();
    },
  );
  it("holds the lock until the action-specific callback completes", async () => {
    let finish!: (result: { ok: boolean }) => void;
    const execute = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = withSocialPreparation("help", input, execute);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(state.release).not.toHaveBeenCalled();
    finish({ ok: true });
    expect(await pending).toEqual({ ok: true });
    expect(state.release).toHaveBeenCalledOnce();
  });
});
