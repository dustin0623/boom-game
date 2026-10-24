import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { requireWorkerReadiness, refreshWorkerReadiness } from "./client";
import { useWorkerStore } from "@/features/stores/workerStore";
beforeEach(() => useWorkerStore.getState().set(null, "checking"));
afterEach(() => vi.unstubAllGlobals());
describe("worker submission preflight", () => {
  it("requests uncached readiness and permits only explicit availability", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ ok: true, worker: { available: true, reason: "ready" } }),
    );
    vi.stubGlobal("fetch", fetcher);
    await requireWorkerReadiness(() => true);
    expect(fetcher).toHaveBeenCalledWith("/api/health", { cache: "no-store" });
    expect(useWorkerStore.getState().available).toBe(true);
  });
  it.each([
    {},
    { worker: { available: false } },
    { worker: { available: "true" } },
  ])("fails closed for unavailable or malformed responses", async (body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(body)),
    );
    await expect(requireWorkerReadiness(() => true)).rejects.toThrow(
      "unavailable",
    );
  });
  it("fails closed on connection errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Error("offline");
      }),
    );
    await expect(requireWorkerReadiness(() => true)).rejects.toThrow(
      "unavailable",
    );
  });
  it("discards readiness after switching or reconnecting", async () => {
    let current = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        current = false;
        return Response.json({ worker: { available: true } });
      }),
    );
    await expect(requireWorkerReadiness(() => current)).rejects.toThrow(
      "session changed",
    );
    expect(useWorkerStore.getState().available).toBeNull();
  });
  it("does not let an older response overwrite a newer readiness lookup", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((done) => {
              resolve = done;
            }),
        )
        .mockResolvedValue(Response.json({ worker: { available: false } })),
    );
    const first = refreshWorkerReadiness(() => true);
    await refreshWorkerReadiness(() => true);
    resolve(Response.json({ worker: { available: true } }));
    await first;
    expect(useWorkerStore.getState().available).toBe(false);
  });
});
