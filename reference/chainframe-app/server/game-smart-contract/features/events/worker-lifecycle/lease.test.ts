import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  acquire: vi.fn(),
  renew: vi.fn(),
  readiness: vi.fn(),
  release: vi.fn(),
}));
vi.mock("@/lib/modules/game-stats/server.repository", () => ({
  contractStreamRepository: {
    acquireLease: state.acquire,
    renewLease: state.renew,
    releaseLease: state.release,
  },
  setContractReadiness: state.readiness,
}));
import { acquireWorkerLease } from "./lease";
beforeEach(() => {
  vi.resetAllMocks();
  state.acquire.mockResolvedValue(true);
  state.renew.mockResolvedValue(true);
});
describe("captured worker lease", () => {
  it("binds lease/readiness changes to the acquired owner", async () => {
    const lease = await acquireWorkerLease({ owner: "worker-a", ttlMs: 1000 });
    await lease.markStarting();
    expect(await lease.check()).toBe(true);
    await lease.markBlockChecked();
    await lease.release();
    expect(state.acquire).toHaveBeenCalledWith("worker-a", 1000);
    expect(state.renew).toHaveBeenCalledWith("worker-a", 1000);
    expect(state.readiness.mock.calls).toEqual([
      ["worker-a", false],
      ["worker-a", true, true],
    ]);
    expect(state.release).toHaveBeenCalledWith("worker-a");
  });
  it("refuses conflicting workers before publishing readiness", async () => {
    state.acquire.mockResolvedValue(false);
    await expect(
      acquireWorkerLease({ owner: "worker-b", ttlMs: 1000 }),
    ).rejects.toThrow("Smart-contract worker lease already held");
    expect(state.readiness).not.toHaveBeenCalled();
    expect(state.renew).not.toHaveBeenCalled();
  });
  it("reports expired ownership without turning renewal into readiness", async () => {
    const lease = await acquireWorkerLease({ owner: "worker-a", ttlMs: 1000 });
    state.renew.mockResolvedValue(false);
    expect(await lease.check()).toBe(false);
    expect(state.readiness).not.toHaveBeenCalled();
  });
  it("preserves database failures rather than misclassifying them as lease loss", async () => {
    const lease = await acquireWorkerLease({ owner: "worker-a", ttlMs: 1000 });
    const failure = new Error("RPC/database unavailable");
    state.renew.mockRejectedValue(failure);
    await expect(lease.check()).rejects.toBe(failure);
    expect(state.readiness).not.toHaveBeenCalled();
  });
  it("propagates owner-guarded readiness failure", async () => {
    const lease = await acquireWorkerLease({ owner: "worker-a", ttlMs: 1000 });
    state.readiness.mockRejectedValue(
      new Error("Smart-contract worker lease lost"),
    );
    await expect(lease.markBlockChecked()).rejects.toThrow("lease lost");
  });
});
