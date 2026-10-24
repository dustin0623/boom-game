// template/app/api/game/raid/targets/route.test.ts
//
// Boundary test: auth, query validation, and error mapping for
// GET /api/game/raid/targets.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EQUIPMENT_STATS_EFFECTIVE_AT } from "@/lib/config/constants/game";

vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/modules/players/server.repository", async () =>
  (await import("@/tests/fixtures/raid-target-reads")).players);
vi.mock("@/lib/modules/equipments/server.repository", async () =>
  (await import("@/tests/fixtures/raid-target-reads")).equipments);

import { requireSession } from "@/lib/auth/session";
import {
  findPlayerByWallet,
  findRaidTargets,
} from "@/lib/modules/players/server.repository";
import { GET } from "./route";

function request(query: string) {
  return new Request(`http://localhost/api/game/raid/targets${query}`, {
    headers: { authorization: "Bearer token" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/game/raid/targets", () => {
  it("returns the session's Response unchanged when unauthenticated", async () => {
    const unauthorized = Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
    vi.mocked(requireSession).mockResolvedValue(unauthorized);

    const res = await GET(request("?defense=5"));

    expect(res.status).toBe(401);
  });

  it("returns 400 when defense is missing or not a positive number", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });

    const res = await GET(request(""));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("defense must be a positive number");
    expect(findPlayerByWallet).not.toHaveBeenCalled();
  });

  it("returns 404 when the requesting player does not exist", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findPlayerByWallet).mockResolvedValue(null);

    const res = await GET(request("?defense=5"));

    expect(res.status).toBe(404);
  });

  it("returns 200 with mapped rivals on success", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findPlayerByWallet).mockResolvedValue({
      wallet: "0xWALLET",
    } as never);
    vi.mocked(findRaidTargets).mockResolvedValue([
      {
        wallet: "0xTARGET",
        username: "rival",
        level: 3,
        vault: 0.163249,
        lastTickAt: EQUIPMENT_STATS_EFFECTIVE_AT + 1000,
        lastSinkAt: EQUIPMENT_STATS_EFFECTIVE_AT + 1000,
        milestones: { totalClaimed: 1, raids: 2 },
        vaultStaked: 0, notoriety: 0,
        statLevels: { hashRate: 2, hackPower: 3, security: 1, luck: 0, firewall: 0, exploit: 0 },
        stats: { hashRate: 2, security: 1, firewall: 1, hackPower: 3 },
      },
    ] as never);

    vi.spyOn(Date, "now").mockReturnValue(EQUIPMENT_STATS_EFFECTIVE_AT + 1000);
    const res = await GET(request("?defense=5"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.rivals).toHaveLength(1);
    expect(body.rivals[0]).toMatchObject({
      id: "0xTARGET",
      username: "rival",
      level: 3,
      vault: 0.163249,
    });
    expect(findRaidTargets).toHaveBeenCalledWith(5, "0xWALLET");
  });

  it("exposes viewer-specific Help eligibility without private sabotage details", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findPlayerByWallet).mockResolvedValue({
      wallet: "0xWALLET",
    } as never);
    const base = {
      level: 1,
      vault: 1,
      lastTickAt: EQUIPMENT_STATS_EFFECTIVE_AT + 1000,
      lastSinkAt: EQUIPMENT_STATS_EFFECTIVE_AT + 1000,
      vaultStaked: 0, notoriety: 0,
      statLevels: { hashRate: 1, hackPower: 1, security: 1, luck: 0, firewall: 0, exploit: 0 },
      stats: { hashRate: 1, security: 1, firewall: 1, hackPower: 1 },
    };
    vi.mocked(findRaidTargets).mockResolvedValue([
      {
        ...base,
        wallet: "0xSAB",
        username: "sabotaged",
        statEffects: {
          security: {
            active: true,
            strength: 0.3,
            helps: [],
            appliedBy: "0xSECRET",
            itemId: "sabotage-device",
            appliedAt: 1,
          },
        },
      },
      { ...base, wallet: "0xCLEAN", username: "clean" },
      {
        ...base,
        wallet: "0xOWN",
        username: "own",
        statEffects: {
          hashRate: {
            active: true,
            strength: 0.4,
            helps: [],
            appliedBy: "0xWALLET",
            itemId: "sabotage-device",
            appliedAt: 1,
          },
        },
      },
      {
        ...base,
        wallet: "0xOFF",
        username: "off",
        statEffects: {},
      },
    ] as never);

    const res = await GET(request("?defense=5"));
    const body = await res.json();

    const byId = Object.fromEntries(
      body.rivals.map((r: { id: string }) => [r.id, r]),
    );
    expect(byId["0xSAB"].sabotageActive).toBe(true);
    expect(byId["0xCLEAN"].sabotageActive).toBe(false);
    expect(byId["0xOFF"].sabotageActive).toBe(false);
    expect(byId["0xOWN"].helpBlockedByOwnSabotage).toBe(true);
    expect(byId["0xSAB"].helpBlockedByOwnSabotage).toBe(false);
    expect(byId["0xCLEAN"].helpBlockedByOwnSabotage).toBe(false);
    expect(byId["0xOFF"].helpBlockedByOwnSabotage).toBe(false);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("0xSECRET");
    expect(serialized).not.toContain("sabotage-device");
    expect(serialized).not.toContain("appliedBy");
    expect(serialized).not.toContain("0xWALLET");
  });

  it("estimates offline vaults at one captured time without mutating the records", async () => {
    vi.mocked(requireSession).mockResolvedValue({ wallet: "alice", username: "alice" });
    vi.mocked(findPlayerByWallet).mockResolvedValue({ wallet: "alice" } as never);
    const at = EQUIPMENT_STATS_EFFECTIVE_AT + 86400_000;
    const targets = ["bob", "carol"].map((wallet) => ({
      wallet, username: wallet, level: 1, vault: 0, vaultStaked: 0, notoriety: 0,
      lastTickAt: at - 6 * 3600_000, lastSinkAt: at,
      statLevels: { hashRate: 1, hackPower: 1, security: 1, luck: 0, firewall: 0, exploit: 0 },
    }));
    const before = structuredClone(targets);
    vi.mocked(findRaidTargets).mockResolvedValue(targets as never);
    const clock = vi.spyOn(Date, "now").mockReturnValueOnce(at).mockReturnValue(at + 3600_000);
    const response = await GET(request("?defense=20"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.rivals.map((rival: { vault: number }) => rival.vault)).toEqual([0.5, 0.5]);
    expect(clock).toHaveBeenCalledOnce();
    expect(targets).toEqual(before);
    for (const privateField of ["lastTickAt", "lastSinkAt", "statLevels", "statEffects"])
      expect(JSON.stringify(body)).not.toContain(privateField);
  });

  it("maps an unexpected thrown error to a 500", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findPlayerByWallet).mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(request("?defense=5"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "Internal server error" });
  });
});
