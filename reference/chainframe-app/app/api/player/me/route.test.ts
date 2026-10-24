import { getFixtureRepositories } from "@/tests/fixtures/persistence";
// template/app/api/player/me/route.test.ts
//
// Boundary test: auth, first-touch registration + referral wiring, the
// read-only profiles, first-touch writes, and error mapping for GET /api/player/me.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/modules/players/server.repository", async (_original) => ({
  ...(await (() => ({
    findPlayerByWallet: vi.fn(),
    findPlayerByUsername: vi.fn(),
    upsertPlayer: vi.fn(),
    updatePlayer: vi.fn(),
    incrementPlayer: vi.fn(),
    initializePlayerProfile: vi.fn(async () => true),
    assignPlayerReferrer: vi.fn(async () => true),
  }))()),
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
vi.mock("@/lib/modules/transactions-pending/server.repository", () => ({
  hasRegistrationJob: vi.fn(async () => false),
}));
vi.mock("@/lib/modules/transactions-processed/server.repository", () => ({
  hasRegistrationReceipt: vi.fn(async () => false),
}));
vi.mock("@/lib/modules/game-stats/server.repository", async (_original) => ({
  ...(await (() => ({ incrementStat: vi.fn() }))()),
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
const db = vi.hoisted(() => ({
  players: { findByWallet: vi.fn(), applyTick: vi.fn() },
}));
vi.mock("@/tests/fixtures/persistence", () => ({
  getFixtureRepositories: () => db,
}));
vi.mock("@/features/events/backend/tick-player/action", () => ({
  tickPlayer: vi.fn((player) => ({ player })),
  tickPatch: vi.fn(() => ({})),
}));

import { requireSession } from "@/lib/auth/session";
import {
  findPlayerByWallet,
  findPlayerByUsername,
  upsertPlayer,
  updatePlayer,
  incrementPlayer,
  assignPlayerReferrer,
} from "@/lib/modules/players/server.repository";
import { hasRegistrationJob } from "@/lib/modules/transactions-pending/server.repository";
import { hasRegistrationReceipt } from "@/lib/modules/transactions-processed/server.repository";
import { incrementStat } from "@/lib/modules/game-stats/server.repository";
import { GET } from "./route";

function basePlayer(overrides: Record<string, unknown> = {}) {
  return {
    wallet: "0xWALLET",
    username: "0xWALLET",
    registrationTime: 1,
    xp: 0,
    level: 1,
    hash: 0,
    sparks: 0,
    vault: 0,
    vaultStaked: 0,
    notoriety: 0,
    statLevels: { hashRate: 1, hackPower: 1, security: 1, luck: 0, firewall: 0, exploit: 0 },
    stats: { hashRate: 1 },
    lastTickAt: 0,
    lastSinkAt: 0,
    claimCharges: 0,
    lastClaimRegenAt: 0,
    raidCharges: 0,
    lastRaidRegenAt: 0,
    lastUpgradeTime: 0,
    raidCooldown: 0,
    milestones: {},
    protectionUntil: 0,
    version: 1,
    isRegistered: false,
    referredBy: null,
    profileInitialized: true,
    ...overrides,
  };
}

function getRequest(query = "") {
  return new Request(`http://localhost/api/player/me${query}`, {
    headers: { authorization: "Bearer token" },
  });
}

beforeEach(() => {
  db.players.findByWallet.mockResolvedValue(basePlayer());
  vi.clearAllMocks();
  vi.mocked(findPlayerByWallet)
    .mockReset()
    .mockResolvedValue(basePlayer() as never);
  vi.mocked(hasRegistrationJob).mockResolvedValue(false);
  vi.mocked(hasRegistrationReceipt).mockResolvedValue(false);
  vi.mocked(assignPlayerReferrer).mockResolvedValue(true);
  vi.mocked(findPlayerByUsername).mockResolvedValue(null);
});

describe("GET /api/player/me", () => {
  it("returns the session's Response unchanged when unauthenticated", async () => {
    const unauthorized = Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
    vi.mocked(requireSession).mockResolvedValue(unauthorized);

    const res = await GET(getRequest());

    expect(res.status).toBe(401);
    expect(findPlayerByWallet).not.toHaveBeenCalled();
  });

  it("initializes a first-time profile and wires a valid referral", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findPlayerByWallet)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        basePlayer({ profileInitialized: false }) as never,
      );
    vi.mocked(findPlayerByUsername).mockResolvedValue(
      basePlayer({ wallet: "0xREFERRER", username: "ref" }) as never,
    );

    const res = await GET(getRequest("?ref=ref"));

    expect(res.status).toBe(200);
    expect(upsertPlayer).toHaveBeenCalledWith({
      profileInitialized: false,
      wallet: "0xWALLET",
      username: "0xWALLET",
    });
    expect(incrementStat).toHaveBeenCalledWith("registeredPlayers");
    expect(assignPlayerReferrer).toHaveBeenCalledWith("0xWALLET", "0xREFERRER");
    expect(incrementPlayer).toHaveBeenCalledWith("0xREFERRER", {
      referralCount: 1,
    });
  });

  it("does not wire a referral when referring to self", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findPlayerByWallet)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(basePlayer() as never);
    vi.mocked(findPlayerByUsername).mockResolvedValue(basePlayer() as never);

    await GET(getRequest("?ref=self"));

    expect(incrementPlayer).not.toHaveBeenCalled();
  });

  it("attaches a valid link to an existing unregistered profile without repeating initialization", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findPlayerByUsername).mockResolvedValue(
      basePlayer({ wallet: "corven", username: "corven" }) as never,
    );
    await GET(getRequest("?ref=%20CORVEN%20"));
    expect(findPlayerByUsername).toHaveBeenCalledWith("corven");
    expect(assignPlayerReferrer).toHaveBeenCalledWith("0xWALLET", "corven");
    expect(incrementPlayer).toHaveBeenCalledExactlyOnceWith("corven", {
      referralCount: 1,
    });
    expect(incrementStat).not.toHaveBeenCalled();
    expect(upsertPlayer).not.toHaveBeenCalled();
  });
  it.each([
    "registered",
    "existing-referrer",
    "registration-job",
    "registration-receipt",
    "missing-referrer",
    "invalid-referrer",
  ])("leaves attribution unchanged for %s", async (reason) => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findPlayerByWallet).mockResolvedValue(
      basePlayer({
        isRegistered: reason === "registered",
        referredBy: reason === "existing-referrer" ? "someone" : null,
      }) as never,
    );
    if (reason !== "missing-referrer")
      vi.mocked(findPlayerByUsername).mockResolvedValue(
        basePlayer({ wallet: "corven", username: "corven" }) as never,
      );
    vi.mocked(hasRegistrationJob).mockResolvedValue(
      reason === "registration-job",
    );
    vi.mocked(hasRegistrationReceipt).mockResolvedValue(
      reason === "registration-receipt",
    );
    const response = await GET(
      getRequest(
        reason === "invalid-referrer" ? "?ref=%3Cinvalid%3E" : "?ref=corven",
      ),
    );
    expect(response.status).toBe(200);
    expect(assignPlayerReferrer).not.toHaveBeenCalled();
    expect(incrementPlayer).not.toHaveBeenCalled();
  });

  it("returns 404 when the player still cannot be found after registration", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findPlayerByWallet).mockResolvedValue(null);

    const res = await GET(getRequest());

    expect(res.status).toBe(404);
  });

  it("returns the player DTO without mutating state", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findPlayerByWallet).mockResolvedValue(
      basePlayer({
        loginNonce: "private-nonce",
        withdrawalReservations: [{ key: "private-reservation" }],
      }) as never,
    );

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.player.address).toBe("0xWALLET");
    expect(db.players.applyTick).not.toHaveBeenCalled();
    expect(findPlayerByWallet).toHaveBeenCalledOnce();
    expect(upsertPlayer).not.toHaveBeenCalled();
    expect(incrementStat).not.toHaveBeenCalled();
    expect(updatePlayer).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("private");
  });

  it("maps an unexpected thrown error to a 500", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findPlayerByWallet).mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "Internal server error" });
  });
});

vi.mock("@/lib/modules/equipments/server.repository", async (original) => ({
  ...(await original<
    typeof import("@/lib/modules/equipments/server.repository")
  >()),
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
vi.mock("@/lib/modules/logs/server.repository", async (original) => ({
  ...(await original<typeof import("@/lib/modules/logs/server.repository")>()),
  logRepository: new Proxy(
    {},
    {
      get: (_, key) =>
        getFixtureRepositories().logs[
          key as keyof ReturnType<typeof getFixtureRepositories>["logs"]
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
