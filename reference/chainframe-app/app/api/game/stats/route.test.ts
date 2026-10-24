import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  players: vi.fn(),
  logs: vi.fn(),
  receipts: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/modules/players/server.repository", () => ({
  readRegisteredMiningBatches: mocks.players,
}));
vi.mock("@/lib/modules/logs/server.repository", () => ({
  readAnalyticsLogBatches: mocks.logs,
}));
vi.mock("@/lib/modules/transactions-processed/server.repository", () => ({
  readAnalyticsReceipts: mocks.receipts,
}));
const now = Date.parse("2026-10-14T12:00:00Z");
const request = (query = "") =>
  new Request(`http://localhost/api/game/stats${query}`, {
    headers: { origin: "http://localhost:3000" },
  });
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now);
  mocks.session.mockResolvedValue({ wallet: "alice", username: "alice" });
  mocks.players.mockImplementation(async function* () {
    yield [
      { wallet: "miner", vaultStaked: 0, notoriety: 0, statLevels: { hashRate: 1, hackPower: 1, security: 1, luck: 0, firewall: 0, exploit: 0 }, lastSinkAt: now },
      { wallet: "miner", vaultStaked: 0, notoriety: 0, statLevels: { hashRate: 1, hackPower: 1, security: 1, luck: 0, firewall: 0, exploit: 0 }, lastSinkAt: now },
    ];
  });
  mocks.logs.mockImplementation(async function* () {});
  mocks.receipts.mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());
describe("authenticated global analytics", () => {
  it("authenticates before reading or serving a cached snapshot", async () => {
    const { GET } = await import("./route");
    await GET(request());
    mocks.session.mockResolvedValue(
      Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    );
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.players).toHaveBeenCalledOnce();
  });
  it("sums individual rates without the shop minerate floor or registration requirement", async () => {
    const { GET, OPTIONS } = await import("./route");
    const response = await GET(request());
    const body = await response.json();
    expect(body.mining.registeredPlayers).toBe(2);
    expect(body.mining.hashPerDay).toBeCloseTo(4, 10);
    expect(body.mining.hashPerSecond).toBeCloseTo(4 / 86400, 12);
    expect(body.asOf).toBe(now);
    expect(body.totals.claimed).toEqual([0, 0]);
    expect(JSON.stringify(body)).not.toContain("alice");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect((await OPTIONS(request())).status).toBe(204);
  });
  it("rejects mining charts, unsupported ranges and unknown query fields before querying", async () => {
    const { GET } = await import("./route");
    for (const query of [
      "?metric=emission",
      "?metric=mining",
      "?metric=claimed&days=8",
      "?metric=claimed&days=1.5",
      "?wallet=bob",
    ])
      expect((await GET(request(query))).status).toBe(400);
    expect(mocks.players).not.toHaveBeenCalled();
  });
  it("processes every log batch, correlates exact evidence and returns complete UTC ranges", async () => {
    const rows = Array.from({ length: 251 }, (_, i) => ({
      id: String(i),
      type: "claim",
      wallet: "alice",
      correlationKey: `tx${i}:0`,
      createdAt: now - 86400000,
      amount: 1,
    }));
    mocks.logs.mockImplementation(async function* () {
      yield rows.slice(0, 250);
      yield rows.slice(250);
    });
    mocks.receipts.mockImplementation(async (keys: string[]) =>
      keys.map((key) => ({
        key,
        wallet: "alice",
        type: "game_action",
        action: "claim",
        operationIndex: 0,
      })),
    );
    const { GET } = await import("./route");
    for (const days of [7, 30, 90]) {
      const body = await (
        await GET(request(`?metric=claimed&days=${days}`))
      ).json();
      expect(body.points).toHaveLength(days);
      expect(body.series).toEqual([
        { label: "HASH claimed", unit: "HASH" },
        { label: "Claims", unit: "count" },
      ]);
      expect(body.points.at(-2)).toEqual({
        day: "2026-10-13",
        values: [251, 251],
      });
      expect(body.points.at(-1)).toEqual({ day: "2026-10-14", values: [0, 0] });
      expect(body.totals).toEqual([251, 251]);
    }
    expect(mocks.logs).toHaveBeenCalledOnce();
    expect(mocks.receipts.mock.calls.map((call) => call[0].length)).toEqual([
      250, 1,
    ]);
  });
  it("coalesces concurrent reads and expires after sixty seconds", async () => {
    let complete!: () => void;
    const gate = new Promise<void>((resolve) => {
      complete = resolve;
    });
    mocks.players.mockImplementation(async function* () {
      await gate;
      yield [];
    });
    const { GET } = await import("./route");
    const first = GET(request()),
      second = GET(request("?metric=claimed"));
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.players).toHaveBeenCalledOnce();
    complete();
    await Promise.all([first, second]);
    await GET(request());
    expect(mocks.players).toHaveBeenCalledOnce();
    vi.spyOn(Date, "now").mockReturnValue(now + 60000);
    await GET(request());
    expect(mocks.players).toHaveBeenCalledTimes(2);
  });
  it("expires at UTC midnight even inside the cache lifetime", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-14T23:59:59Z"));
    const { GET } = await import("./route");
    await GET(request());
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-15T00:00:01Z"));
    const body = await (await GET(request("?metric=claimed"))).json();
    expect(mocks.players).toHaveBeenCalledTimes(2);
    expect(body.points.at(-1).day).toBe("2026-10-15");
  });
  it("never caches partial results and allows explicit retry after failure", async () => {
    mocks.logs.mockImplementationOnce(async function* () {
      throw new Error("private database failure");
    });
    const { GET } = await import("./route");
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Unable to read game statistics",
    });
    expect((await GET(request())).status).toBe(200);
    expect(mocks.players).toHaveBeenCalledTimes(2);
  });
});
