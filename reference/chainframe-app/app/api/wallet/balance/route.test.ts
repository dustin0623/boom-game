// template/app/api/wallet/balance/route.test.ts
//
// Boundary test: auth and error mapping for GET /api/wallet/balance.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/chains/modules/hive/server/events/get-balance/action", () => ({
  getBalance: vi.fn(),
}));

import { requireSession } from "@/lib/auth/session";
import { getBalance } from "@/lib/chains/modules/hive/server/events/get-balance/action";
import { GET } from "./route";

function request(query = "") {
  return new Request("http://localhost/api/wallet/balance" + query, {
    headers: { authorization: "Bearer token" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/wallet/balance", () => {
  it("returns the session's Response unchanged when unauthenticated", async () => {
    const unauthorized = Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
    vi.mocked(requireSession).mockResolvedValue(unauthorized);

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(getBalance).not.toHaveBeenCalled();
  });

  it("returns the HASH balance on success", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "alice",
      username: "alice",
    });
    vi.mocked(getBalance).mockResolvedValue({
      hive: "0",
      hbd: "0",
      token: "42",
      symbol: "HASH",
      precision: { hive: 3, hbd: 3, token: 3 },
    });

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      balance: 42,
      symbol: "HASH",
      precision: 3,
    });
    expect(getBalance).toHaveBeenCalledWith(
      "alice",
      expect.any(String),
      expect.any(Number),
    );
  });

  it("maps an adapter failure to a 503", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "alice",
      username: "alice",
    });
    vi.mocked(getBalance).mockRejectedValue(new Error("rpc down"));

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      error: "Unable to read Hive wallet balance",
    });
  });
  it("reads native HIVE with the existing response envelope", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      wallet: "alice",
      username: "alice",
    });
    vi.mocked(getBalance).mockResolvedValue({
      hive: "1.125",
      hbd: "0",
      token: "0",
      symbol: "HIVE",
      precision: { hive: 3, hbd: 3, token: 3 },
    });
    const result = await GET(request("?asset=HIVE"));
    expect(await result.json()).toEqual({
      ok: true,
      balance: 1.125,
      symbol: "HIVE",
      precision: 3,
    });
    expect(getBalance).toHaveBeenCalledExactlyOnceWith("alice", "HIVE", 3);
  });
  it.each(["HBD", "hive", "OTHER", ""])(
    'rejects unsupported asset "%s" before blockchain access',
    async (asset) => {
      vi.mocked(requireSession).mockResolvedValue({
        wallet: "alice",
        username: "alice",
      });
      expect((await GET(request("?asset=" + asset))).status).toBe(400);
      expect(getBalance).not.toHaveBeenCalled();
    },
  );
});
