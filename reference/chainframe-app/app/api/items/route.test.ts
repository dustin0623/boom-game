// template/app/api/items/route.test.ts
//
// Boundary test: auth, DTO shaping, and error mapping for GET /api/items.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/modules/items/server.repository", () => ({
  findInventoryItemsByWallet: vi.fn(async () => []),
}));
vi.mock("@/lib/modules/equipments/server.repository", () => ({
  findEquipmentsByOwner: vi.fn(),
}));

import { requireSession } from "@/lib/auth/session";
import { findEquipmentsByOwner } from "@/lib/modules/equipments/server.repository";
import { findInventoryItemsByWallet } from "@/lib/modules/items/server.repository";
import { GET } from "./route";

function request() {
  return new Request("http://localhost/api/items", {
    headers: { authorization: "Bearer token" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/items", () => {
  it("returns the session's Response unchanged when unauthenticated", async () => {
    const unauthorized = Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
    vi.mocked(requireSession).mockResolvedValue(unauthorized);

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(findEquipmentsByOwner).not.toHaveBeenCalled();
  });

  it("returns 200 with items mapped to DTOs", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findEquipmentsByOwner).mockResolvedValue([
      {
        _id: "item-1",
        templateId: 1,
        owner: "0xWALLET",
        name: "Shield",
        slot: "armor",
        rarity: "rare",
        level: 2,
        stats: {},
        equipped: false,
        salvaged: false,
        market: null,
        createdAt: new Date(0),
        lastTransfer: null,
      },
    ] as never);
    vi.mocked(findInventoryItemsByWallet).mockResolvedValueOnce([
      {
        wallet: "0xWALLET",
        itemId: "equipment",
        quantity: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.equipments).toHaveLength(1);
    expect(body.equipments[0]).toMatchObject({ id: "item-1", slot: "armor" });
    expect(body.items).toEqual([{ itemId: "equipment", quantity: 2 }]);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("maps an unexpected thrown error to a 500", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "0xWALLET",
      username: "p",
    });
    vi.mocked(findEquipmentsByOwner).mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "Internal server error" });
  });
});
