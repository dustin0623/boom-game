vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));
import { requireSession } from "@/lib/auth/session";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/modules/equipments/server.repository", () => ({
  findListedEquipments: vi.fn(),
}));

import { findListedEquipments } from "@/lib/modules/equipments/server.repository";
import { GET } from "./route";

function request() {
  return new Request("http://localhost/api/market");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue({
    wallet: "alice",
    username: "alice",
  });
});

describe("GET /api/market", () => {
  it("returns listings sorted by most recently listed first", async () => {
    vi.mocked(findListedEquipments).mockResolvedValue([
      {
        _id: "item-1",
        templateId: 1,
        owner: "0xA",
        name: "Old",
        slot: "weapon",
        rarity: "common",
        level: 1,
        stats: {},
        market: { price: 10, listedAt: 100 },
      },
      {
        _id: "item-2",
        templateId: 2,
        owner: "0xB",
        name: "New",
        slot: "armor",
        rarity: "rare",
        level: 2,
        stats: {},
        market: { price: 20, listedAt: 200 },
      },
    ] as never);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.listings.map((l: { refId: string }) => l.refId)).toEqual([
      "item-2",
      "item-1",
    ]);
    expect(body.listings[0]).toMatchObject({
      kind: "item",
      price: 20,
      owner: "0xB",
    });
  });

  it("returns an empty list when nothing is listed", async () => {
    vi.mocked(findListedEquipments).mockResolvedValue([] as never);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.listings).toEqual([]);
  });

  it("maps an unexpected thrown error to a 500", async () => {
    vi.mocked(findListedEquipments).mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "Internal server error" });
  });
});

it("rejects unauthenticated reads before infrastructure access", async () => {
  vi.mocked(requireSession).mockResolvedValue(
    Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
  );
  const res = await GET(request());
  expect(res.status).toBe(401);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(findListedEquipments).not.toHaveBeenCalled();
});
