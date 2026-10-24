import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/modules/game-stats/server.repository", () => ({
  getContractReadiness: vi.fn(),
}));
vi.mock("@/lib/auth/secret.server", () => ({
  getJwtSecret: vi.fn(() => "configured-secret"),
}));
import { getContractReadiness } from "@/lib/modules/game-stats/server.repository";
import { getJwtSecret } from "@/lib/auth/secret.server";
import { config } from "@/lib/config/config";
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getJwtSecret).mockReturnValue("configured-secret");
});
describe("GET /api/health", () => {
  it.each([
    [null, "worker-unavailable"],
    [
      { leaseOwner: "private", leaseExpiresAt: Date.now() - 1 },
      "worker-unavailable",
    ],
    [
      {
        leaseOwner: "private",
        leaseExpiresAt: Date.now() + 60_000,
        workerReady: false,
      },
      "worker-starting",
    ],
    [
      {
        leaseOwner: "private",
        leaseExpiresAt: Date.now() + 60_000,
        workerReady: true,
        lastCheckedAt:
          Date.now() - Math.max(90_000, 18 * config.game.stream.pollMs) - 1000,
      },
      "stream-stalled",
    ],
    [
      {
        leaseOwner: "private",
        leaseExpiresAt: Date.now() + 60_000,
        workerReady: true,
        lastCheckedAt: Date.now(),
      },
      "ready",
    ],
  ])(
    "returns coarse readiness without private lease data",
    async (record, reason) => {
      vi.mocked(getContractReadiness).mockResolvedValue(record as never);
      const response = await GET(new Request("http://localhost/api/health"));
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({
        ok: true,
        status: "ok",
        worker: { available: reason === "ready", reason },
      });
    },
  );

  it.each(["database", "secret"])(
    "fails readiness closed after %s failure while preserving liveness",
    async (source) => {
      if (source === "database")
        vi.mocked(getContractReadiness).mockRejectedValue(
          new Error("credentials"),
        );
      else
        vi.mocked(getJwtSecret).mockImplementation(() => {
          throw Error("invalid secret");
        });
      const response = await GET(new Request("http://localhost/api/health"));
      expect(await response.json()).toEqual({
        ok: true,
        status: "ok",
        worker: { available: false, reason: "service-unavailable" },
      });
    },
  );
});
