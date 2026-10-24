vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));
import { requireSession } from "@/lib/auth/session";
import { beforeEach, describe, expect, it, vi } from "vitest";
const settings = vi.hoisted(() => ({
  treasuryAccount: "treasury",
  token: "HASH",
  tokenPrecision: 3,
}));
vi.mock("@/lib/config/config", () => ({ config: { blockchain: settings } }));

vi.mock("@/lib/chains/modules/hive/server/events/get-balance/action", () => ({
  getBalance: vi.fn(),
}));

import { getBalance } from "@/lib/chains/modules/hive/server/events/get-balance/action";
import { GET } from "./route";

function request() {
  return new Request("http://localhost/api/wallet/treasury-balance");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue({
    wallet: "alice",
    username: "alice",
  });
  settings.treasuryAccount = "treasury";
});

describe("GET /api/wallet/treasury-balance", () => {
  it("returns the treasury HASH balance on authenticated success", async () => {
    vi.mocked(getBalance).mockResolvedValue({
      hive: "0",
      hbd: "0",
      token: "1000",
      symbol: "HASH",
      precision: { hive: 3, hbd: 3, token: 3 },
    } as never);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      balance: 1000,
      symbol: "HASH",
      precision: 3,
    });
    expect(getBalance).toHaveBeenCalledWith("treasury", "HASH", 3);
  });

  it("does not request a balance when the treasury account is missing", async () => {
    settings.treasuryAccount = "";
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(getBalance).not.toHaveBeenCalled();
  });

  it("maps an adapter failure to a 503", async () => {
    vi.mocked(getBalance).mockRejectedValue(new Error("rpc down"));

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      error: "Unable to read Hive treasury balance",
    });
  });
});

it("rejects unauthenticated reads before infrastructure access", async () => {
  vi.mocked(requireSession).mockResolvedValue(
    Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
  );
  const res = await GET(request());
  expect(res.status).toBe(401);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(getBalance).not.toHaveBeenCalled();
});
