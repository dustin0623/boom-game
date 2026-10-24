import { useTransactionStore } from "@/features/stores/transactionStore";
vi.mock("@/features/events/frontend/check-worker-readiness/client", () => ({
  requireWorkerReadiness: vi.fn(async () => {}),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  state: {
    mode: "wallet" as string | null,
    address: "alice" as string | null,
    connectedAt: 1,
    apiConnected: true,
    isRegistered: true,
  },
  broadcast: vi.fn(),
  confirm: vi.fn(),
  refresh: vi.fn(),
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
vi.mock("@/features/stores/playerStore", () => ({
  usePlayerStore: { getState: () => ({ syncFromApi: mocks.refresh }) },
}));
import { TransactionRejected } from "@/features/events/frontend/confirm-transaction/client";
import { executeGameAction, captureGameActionContext } from "./client";
import { buildClaimAction } from "@/lib/utils/game/action-protocol";
const options = () => ({
  build: (nonce: string) => buildClaimAction({ nonce }),
});
const handlers = () => ({
  onLifecycle: vi.fn(),
  onTransactionId: vi.fn(),
  onError: vi.fn(),
  onAwaiting: vi.fn(),
});
beforeEach(() => {
  useTransactionStore.getState().begin(null);
  vi.resetAllMocks();
  mocks.state = {
    mode: "wallet",
    address: "alice",
    connectedAt: 1,
    apiConnected: true,
    isRegistered: true,
  };
  mocks.broadcast.mockResolvedValue({ ok: true, transactionId: "tx" });
  mocks.confirm.mockResolvedValue({ receipt: { status: "success" } });
});
describe("wallet action execution", () => {
  it("broadcasts once and completes from a receipt without applying or refreshing local state", async () => {
    expect(await executeGameAction(options(), handlers())).toBe("processed");
    expect(mocks.broadcast).toHaveBeenCalledOnce();
    expect(mocks.broadcast.mock.calls[0][0].username).toBe("alice");
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("surfaces receipt rejection", async () => {
    mocks.confirm.mockRejectedValue(
      new TransactionRejected("Insufficient HASH"),
    );
    const h = handlers();
    expect(await executeGameAction(options(), h)).toBe("failed");
    expect(h.onError).toHaveBeenCalledWith("Insufficient HASH");
  });
  it.each(["Cancelled", "Broadcast failed"])(
    "preserves %s before submission",
    async (error) => {
      mocks.broadcast.mockResolvedValue({ ok: false, error });
      const h = handlers();
      expect(await executeGameAction(options(), h)).toBe("failed");
      expect(h.onError).toHaveBeenCalledWith(error);
      expect(mocks.confirm).not.toHaveBeenCalled();
    },
  );
  it("keeps a missing transaction ID uncertain without confirmation or retry", async () => {
    mocks.broadcast.mockResolvedValue({ ok: true, transactionId: null });
    const h = handlers();
    expect(await executeGameAction(options(), h)).toBe("broadcast");
    expect(h.onError).toHaveBeenCalledWith(
      expect.stringContaining("without a transaction id"),
    );
    expect(mocks.broadcast).toHaveBeenCalledOnce();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it("keeps a visible-page timeout pending with the transaction ID", async () => {
    mocks.confirm.mockRejectedValue(new Error("Still awaiting processing"));
    const h = handlers();
    expect(await executeGameAction(options(), h)).toBe("broadcast");
    expect(h.onTransactionId).toHaveBeenCalledWith("tx");
    expect(h.onError).toHaveBeenCalledWith("Still awaiting processing");
    expect(mocks.broadcast).toHaveBeenCalledOnce();
  });
  it.each(["logout", "switch", "reconnect"])(
    "does not complete a stale session after %s",
    async (change) => {
      mocks.confirm.mockImplementation(async () => {
        if (change === "logout") mocks.state.address = null;
        else if (change === "switch") mocks.state.address = "bob";
        else mocks.state.connectedAt++;
        return { receipt: { status: "success" } };
      });
      const h = handlers();
      expect(await executeGameAction(options(), h)).toBe("broadcast");
      expect(h.onLifecycle).not.toHaveBeenCalledWith("processed");
      expect(h.onError).toHaveBeenCalledWith(
        expect.stringContaining("session changed"),
      );
    },
  );
  it("rejects a replaced context before opening Keychain", async () => {
    const context = captureGameActionContext();
    mocks.state.connectedAt++;
    expect(await executeGameAction({ ...options(), context }, handlers())).toBe(
      "failed",
    );
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });
  it.each(["disconnected", "unregistered"])(
    "blocks %s gameplay",
    async (status) => {
      if (status === "disconnected") mocks.state.apiConnected = false;
      else mocks.state.isRegistered = false;
      expect(await executeGameAction(options(), handlers())).toBe("failed");
      expect(mocks.broadcast).not.toHaveBeenCalled();
    },
  );
});
