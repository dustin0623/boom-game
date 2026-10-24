// template/app/api/auth/verify/route.test.ts
//
// Boundary test: validation and error mapping for POST /api/auth/verify.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/events/backend/wallet-auth/verify", () => ({
  verifyLoginSignature: vi.fn(),
}));

import { verifyLoginSignature } from "@/features/events/backend/wallet-auth/verify";
import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/verify", () => {
  it.each(["player123", "player-one", "player.one", "abc.def-123"])(
    "passes valid normalized account %s to signature verification",
    async (wallet) => {
      vi.mocked(verifyLoginSignature).mockResolvedValue({
        ok: true,
        token: "jwt-token",
        payload: { wallet },
      } as never);
      const res = await POST(
        request({ wallet: ` ${wallet.toUpperCase()} `, signature: "sig" }),
      );
      expect(res.status).toBe(200);
      expect(verifyLoginSignature).toHaveBeenCalledExactlyOnceWith(
        wallet,
        "sig",
      );
    },
  );

  it.each([
    "player_name",
    "123player",
    "player-",
    "player..one",
    "ab.player",
    "player.123",
  ])(
    "rejects invalid account %s before signature verification",
    async (wallet) => {
      expect((await POST(request({ wallet, signature: "sig" }))).status).toBe(
        400,
      );
      expect(verifyLoginSignature).not.toHaveBeenCalled();
    },
  );
  it("returns 400 for an invalid body", async () => {
    const res = await POST(request({ wallet: "alice1", signature: "" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid request");
    expect(verifyLoginSignature).not.toHaveBeenCalled();
  });

  it("returns 401 when the signature fails verification", async () => {
    vi.mocked(verifyLoginSignature).mockResolvedValue({
      ok: false,
      error: "Bad signature",
    } as never);

    const res = await POST(request({ wallet: "alice1", signature: "sig" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ ok: false, error: "Bad signature" });
  });

  it("returns 200 with a token on success", async () => {
    vi.mocked(verifyLoginSignature).mockResolvedValue({
      ok: true,
      token: "jwt-token",
      payload: { wallet: "alice1" },
    } as never);

    const res = await POST(request({ wallet: "alice1", signature: "sig" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, token: "jwt-token", wallet: "alice1" });
  });

  it("maps an unexpected thrown error to a 500", async () => {
    vi.mocked(verifyLoginSignature).mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(request({ wallet: "alice1", signature: "sig" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "Internal server error" });
  });
});
