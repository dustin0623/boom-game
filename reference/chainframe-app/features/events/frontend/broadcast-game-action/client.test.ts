import { useTransactionStore } from "@/features/stores/transactionStore";
vi.mock("@/features/events/frontend/check-worker-readiness/client", () => ({
  requireWorkerReadiness: vi.fn(async (current: () => boolean) => {
    if (!current()) throw new Error("Wallet session changed before signing");
  }),
}));
vi.mock("@/features/stores/workerStore", () => ({
  useWorkerStore: Object.assign(
    (selector: (state: { available: boolean }) => unknown) =>
      selector({ available: true }),
    { getState: () => ({ available: true, set: vi.fn() }) },
  ),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  state: {
    mode: "wallet",
    address: "alice",
    connectedAt: 1,
    apiConnected: true,
    isRegistered: true,
  },
  broadcast: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("@/features/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ ...mocks.state }) },
}));
vi.mock("@/lib/chains/modules/hive/wallet/events/custom-json/action", () => ({
  broadcastCustomJson: mocks.broadcast,
}));
vi.mock(
  "@/features/events/frontend/confirm-transaction/client",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/events/frontend/confirm-transaction/client")
    >()),
    waitForTransaction: mocks.confirm,
    TransactionRejected: class extends Error {},
  }),
);
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }));
import { broadcastGameAction } from "./client";
import { requireWorkerReadiness } from "@/features/events/frontend/check-worker-readiness/client";
import { submitSignedGameAction } from "./submit";
import { executeGameAction } from "../execute-game-action/client";
import { buildClaimAction } from "@/lib/utils/game/action-protocol";
const payload = () => buildClaimAction({ nonce: "valid-nonce-123456" });
beforeEach(() => {
  useTransactionStore.getState().begin(null);
  vi.clearAllMocks();
  mocks.state = {
    mode: "wallet",
    address: "alice",
    connectedAt: 1,
    apiConnected: true,
    isRegistered: true,
  };
  mocks.broadcast.mockResolvedValue({ ok: true, transactionId: "tx" });
  mocks.confirm.mockResolvedValue({
    receipt: { status: "success" },
    log: { amount: 7 },
  });
});
describe("single action executor", () => {
  it.each([
    [
      "market_list",
      { itemId: "item-1", price: 25, currency: "HIVE" },
      "market list · item-1 · 25 HIVE",
    ],
    ["market_cancel", { itemId: "item-1" }, "market cancel · item-1"],
    [
      "equip_cosmetic",
      { kind: "avatar", templateId: 2 },
      "equip cosmetic · avatar #2",
    ],
    ["request_withdrawal", { amount: 5 }, "request withdrawal · 5 HASH"],
  ] as const)(
    "records descriptive %s metadata before notifying the form",
    async (action, metadata, label) => {
      const onSubmitted = vi.fn(() => {
        expect(useTransactionStore.getState().submitted[0]).toMatchObject({
          label,
          type: "game_action",
          status: "submitted",
        });
      });
      await submitSignedGameAction(action, metadata, onSubmitted);
      expect(onSubmitted).toHaveBeenCalledOnce();
      expect(mocks.broadcast).toHaveBeenCalledOnce();
    },
  );
  it("preserves the exact Custom JSON ID, payload, authority and display message", async () => {
    const submission = payload();
    await broadcastGameAction(submission);
    expect(mocks.broadcast).toHaveBeenCalledExactlyOnceWith({
      username: "alice",
      id: "chainframe-game",
      authority: "posting",
      json: '{"version":1,"action":"claim","metadata":{"nonce":"valid-nonce-123456"}}',
      message: "Chainframe game action: claim",
    });
    expect(submission.version).toBe(1);
  });
  it("never opens Keychain while the worker preflight is unavailable", async () => {
    vi.mocked(requireWorkerReadiness).mockRejectedValueOnce(
      Error("Game processing is unavailable"),
    );
    await expect(broadcastGameAction(payload())).rejects.toThrow("unavailable");
    expect(mocks.broadcast).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(useTransactionStore.getState().submitted).toEqual([]);
  });
  it("API actions use the executor and preserve correlated claim amounts", async () => {
    expect(await submitSignedGameAction("claim", {})).toEqual({
      ok: true,
      transactionId: "tx",
      amount: 7,
    });
    expect(mocks.broadcast).toHaveBeenCalledTimes(1);
    expect(mocks.confirm).toHaveBeenCalledWith(
      "tx",
      mocks.state,
      expect.objectContaining({ operationIndex: 0, requireLog: "claim" }),
    );
  });
  it("dialog actions use the same executor without applying simulation", async () => {
    const apply = vi.fn();
    expect(
      await executeGameAction(
        { build: payload },
        {
          onLifecycle: vi.fn(),
          onTransactionId: vi.fn(),
          onError: vi.fn(),
          onAwaiting: vi.fn(),
        },
      ),
    ).toBe("processed");
    expect(mocks.broadcast).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });
  it("passes explicit operation identity", async () => {
    await broadcastGameAction(payload(), { operationIndex: 2 });
    expect(mocks.confirm).toHaveBeenCalledWith(
      "tx",
      mocks.state,
      expect.objectContaining({ operationIndex: 2 }),
    );
  });

  it("does not broadcast an aborted action", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      broadcastGameAction(payload(), { signal: controller.signal }),
    ).rejects.toThrow("cancelled");
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });
  it("does not wait or retry when the broadcast has no transaction ID", async () => {
    mocks.broadcast.mockResolvedValue({ ok: true, transactionId: null });
    const onSubmitted = vi.fn();
    await expect(
      broadcastGameAction(payload(), { onSubmitted }),
    ).rejects.toThrow("without a transaction id");
    expect(mocks.broadcast).toHaveBeenCalledTimes(1);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(onSubmitted).toHaveBeenCalledOnce();
    expect(useTransactionStore.getState().submitted[0]).toMatchObject({
      transactionId: null,
      status: "unknown",
    });
  });
  it("passes confirmation failures through without rebroadcast", async () => {
    mocks.confirm.mockRejectedValue(new Error("Still awaiting processing"));
    await expect(broadcastGameAction(payload())).rejects.toThrow(
      "Still awaiting processing",
    );
    expect(mocks.broadcast).toHaveBeenCalledTimes(1);
  });
  it("does not confirm a cancelled Keychain request", async () => {
    mocks.broadcast.mockResolvedValue({ ok: false, error: "Cancelled" });
    await expect(broadcastGameAction(payload())).rejects.toThrow("Cancelled");
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(useTransactionStore.getState().submitted).toEqual([]);
  });
});
