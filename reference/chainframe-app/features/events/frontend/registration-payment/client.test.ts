import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  me: vi.fn(),
  transfer: vi.fn(),
  ready: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("@/lib/api/client", () => ({ getMe: m.me }));
vi.mock("@/lib/utils/hive/wallet", () => ({
  getHiveTreasuryAccount: () => "treasury",
}));
vi.mock(
  "@/lib/chains/modules/hive/wallet/events/transfer-native/action",
  () => ({ transferNative: m.transfer }),
);
vi.mock("@/features/events/frontend/check-worker-readiness/client", () => ({
  requireWorkerReadiness: m.ready,
}));
import { payRegistration } from "./client";
let wallet = 0;
const context = () => ({
  session: {
    address: "wallet" + ++wallet,
    mode: "wallet",
    connectedAt: wallet,
  },
  isCurrent: () => true,
  onPhase: vi.fn(),
  confirm: m.confirm,
  isRejected: () => false,
});
beforeEach(() => {
  vi.resetAllMocks();
  m.me.mockResolvedValue({ ok: true, player: { isRegistered: false } });
  m.transfer.mockResolvedValue({ transactionId: "payment" });
  m.confirm.mockResolvedValue({ receipt: { status: "success" } });
});
describe("registration readiness and payment retry protection", () => {
  it("fails closed before a new payment", async () => {
    m.ready.mockRejectedValueOnce(Error("Game processing is unavailable"));
    await expect(payRegistration(context())).rejects.toThrow("unavailable");
    expect(m.transfer).not.toHaveBeenCalled();
  });
  it("resumes an existing confirmation while the worker is unavailable", async () => {
    const callbacks = context();
    m.confirm.mockRejectedValueOnce(Error("Still awaiting processing"));
    await expect(payRegistration(callbacks)).rejects.toThrow(
      "awaiting processing",
    );
    m.ready.mockRejectedValue(Error("Game processing is unavailable"));
    await payRegistration(callbacks);
    expect(m.ready).toHaveBeenCalledOnce();
    expect(m.transfer).toHaveBeenCalledOnce();
    expect(m.confirm).toHaveBeenCalledTimes(2);
  });
  it("checks authoritative registration without requiring payment readiness", async () => {
    m.me.mockResolvedValue({ ok: true, player: { isRegistered: true } });
    await payRegistration(context());
    expect(m.ready).not.toHaveBeenCalled();
    expect(m.transfer).not.toHaveBeenCalled();
  });
});
