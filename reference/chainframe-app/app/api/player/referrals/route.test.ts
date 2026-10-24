import { getFixtureRepositories } from "@/tests/fixtures/persistence";
// template/app/api/player/referrals/route.test.ts
//
// Boundary test: auth, DTO shaping, and error mapping for
// GET /api/player/referrals.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/modules/players/server.repository", async (_original) => ({
  ...(await (() => ({ findPlayerByWallet: vi.fn() }))()),
  playerRepository: new Proxy(
    {},
    {
      get: (_, key) =>
        getFixtureRepositories().players[
          key as keyof ReturnType<typeof getFixtureRepositories>["players"]
        ],
    },
  ),
}));
const db = vi.hoisted(() => ({ players: { listReferred: vi.fn() } }));
vi.mock("@/lib/modules/logs/server.repository", () => ({ getReferralHiveEarned: vi.fn(async () => 7.505) }));
vi.mock("@/tests/fixtures/persistence", () => ({
  getFixtureRepositories: () => db,
}));

import { requireSession } from "@/lib/auth/session";
import { findPlayerByWallet } from "@/lib/modules/players/server.repository";
import { GET } from "./route";

function request() {
  return new Request("http://localhost/api/player/referrals", {
    headers: { authorization: "Bearer token" },
  });
}

function mockFind(result: unknown) {
  db.players.listReferred.mockResolvedValue(result);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/player/referrals", () => {
  it("returns the session's Response unchanged when unauthenticated", async () => {
    const unauthorized = Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
    vi.mocked(requireSession).mockResolvedValue(unauthorized);

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(findPlayerByWallet).not.toHaveBeenCalled();
  });

  it("returns 404 when the player does not exist", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findPlayerByWallet).mockResolvedValue(null);

    const res = await GET(request());

    expect(res.status).toBe(404);
  });

  it("returns referral code, counters, and the referred list on success", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findPlayerByWallet).mockResolvedValue({
      username: "p",
      referralCount: 2,
      referralEarned: 100,
    } as never);
    mockFind([
      { username: "friend", wallet: "0xFRIEND", registrationTime: 123 },
    ]);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      referralCode: "p",
      referralCount: 2,
      referralEarned: 100,
      referred: [{ username: "friend", wallet: "0xFRIEND", joinedAt: 123 }],
      referralHiveEarned: 7.505,
    });
  });

  it("maps an unexpected thrown error to a 500", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findPlayerByWallet).mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "Internal server error" });
  });
});

vi.mock("@/lib/modules/equipments/server.repository", async (original) => ({
  ...(await original<typeof import("@/lib/modules/equipments/server.repository")>()),
  equipmentRepository: new Proxy(
    {},
    {
      get: (_, key) =>
        getFixtureRepositories().items[
          key as keyof ReturnType<typeof getFixtureRepositories>["items"]
        ],
    },
  ),
}));
vi.mock("@/lib/modules/game-stats/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/game-stats/server.repository")
  >()),
  gameStatsRepository: new Proxy(
    {},
    {
      get: (_, key) =>
        getFixtureRepositories().gameStats[
          key as keyof ReturnType<typeof getFixtureRepositories>["gameStats"]
        ],
    },
  ),
}));
vi.mock(
  "@/server/game-smart-contract/features/events/process-game-action/persistence",
  () => ({
    gameActionPersistence: new Proxy(
      {},
      {
        get: (_, key) =>
          getFixtureRepositories().gameEvents[
            key as keyof ReturnType<typeof getFixtureRepositories>["gameEvents"]
          ],
      },
    ),
  }),
);
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
