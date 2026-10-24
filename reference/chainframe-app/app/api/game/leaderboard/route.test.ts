import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), players: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireSession: m.session }));
vi.mock("@/lib/modules/players/server.repository", () => ({
  readLeaderboardPlayerBatches: m.players,
}));
const now = Date.parse("2026-10-14T12:00:00Z");
const request = (query = "") =>
  new Request(`http://localhost/api/game/leaderboard${query}`, {
    headers: { origin: "http://localhost:3000" },
  });
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now);
  m.session.mockResolvedValue({ wallet: "alice", username: "alice" });
  m.players.mockImplementation(async function* () {
    yield [
      {
        wallet: "alice",
        username: "alice",
        xp: 1000,
        notoriety: 2,
        equippedAvatarId: null,
        vaultStaked: 0,
        statLevels: { hashRate: 1, hackPower: 1, security: 1, luck: 0, firewall: 0, exploit: 0 },
        lastSinkAt: now,
      },
    ];
  });
});
afterEach(() => vi.restoreAllMocks());
describe("authenticated leaderboard reads", () => {
  it("authenticates before reading or serving cached ranks", async () => {
    const { GET } = await import("./route");
    await GET(request());
    m.session.mockResolvedValue(
      Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    );
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(m.players).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("returns public ranks with defaults, no-store and CORS", async () => {
    const { GET, OPTIONS } = await import("./route");
    const response = await GET(request());
    expect(await response.json()).toMatchObject({
      ok: true,
      weights: { notoriety: 30, mining: 30, progression: 40 },
      page: 1,
      pageSize: 25,
      self: {
        username: "alice",
        rank: 1,
        miningLevel: 1,
        notoriety: 2,
        xp: 1000,
        score: 100,
        points: { notoriety: 30, mining: 30, progression: 40 },
      },
    });
    expect(m.players).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect((await OPTIONS(request())).status).toBe(204);
  });
  it.each([
    "?metric=claims",
    "?metric=notoriety",
    "?page=0",
    "?page=5",
    "?page=1.5",
    "?wallet=bob",
  ])("rejects %s before reads", async (query) => {
    const { GET } = await import("./route");
    expect((await GET(request(query))).status).toBe(400);
    expect(m.players).not.toHaveBeenCalled();
  });
  it("shares completed rankings but selects each authenticated viewer independently", async () => {
    const { GET } = await import("./route");
    expect((await (await GET(request("?page=1"))).json()).self.username).toBe(
      "alice",
    );
    m.session.mockResolvedValue({ wallet: "bob", username: "bob" });
    expect((await (await GET(request("?page=2"))).json()).self).toBeNull();
    expect(m.players).toHaveBeenCalledOnce();
    vi.mocked(Date.now).mockReturnValue(now + 60000);
    await GET(request());
    expect(m.players).toHaveBeenCalledTimes(2);
  });
  it("coalesces concurrent reads and retries failed computation without partial results", async () => {
    let finish!: () => void;
    const wait = new Promise<void>((resolve) => {
      finish = resolve;
    });
    m.players.mockImplementationOnce(async function* () {
      await wait;
      yield [];
    });
    const { GET } = await import("./route");
    const first = GET(request());
    const second = GET(request("?page=2"));
    await Promise.resolve();
    finish();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect(m.players).toHaveBeenCalledOnce();
    vi.mocked(Date.now).mockReturnValue(now + 60000);
    m.players.mockImplementationOnce(async function* () {
      throw Error("Database unavailable");
    });
    expect((await GET(request())).status).toBe(503);
    expect((await GET(request())).status).toBe(200);
    expect(m.players).toHaveBeenCalledTimes(3);
  });
});
