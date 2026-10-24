// template/app/api/auth/challenge/route.test.ts
//
// Boundary test: validation and error mapping for POST /api/auth/challenge.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/events/backend/wallet-auth/challenge", () => ({
  generateLoginChallenge: vi.fn(),
}));

import { generateLoginChallenge } from "@/features/events/backend/wallet-auth/challenge";
import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/challenge", () => {
  it.each(["player123", "player-one", "player.one", "abc.def-123"])(
    "passes a valid normalized Hive account %s to the login workflow",
    async (wallet) => {
      vi.mocked(generateLoginChallenge).mockResolvedValue("nonce-123");
      const res = await POST(request({ wallet: ` ${wallet.toUpperCase()} ` }));
      expect(res.status).toBe(200);
      expect(generateLoginChallenge).toHaveBeenCalledExactlyOnceWith(wallet);
    },
  );

  it.each([
    "player_name",
    "123player",
    "player-",
    "player..one",
    "ab.player",
    "player.123",
  ])("rejects invalid account %s before issuing a nonce", async (wallet) => {
    expect((await POST(request({ wallet }))).status).toBe(400);
    expect(generateLoginChallenge).not.toHaveBeenCalled();
  });
  it("returns 400 for a wallet that fails the username pattern", async () => {
    const res = await POST(request({ wallet: "ab" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid request");
    expect(generateLoginChallenge).not.toHaveBeenCalled();
  });

  it("lowercases and trims the wallet before issuing a nonce", async () => {
    vi.mocked(generateLoginChallenge).mockResolvedValue("nonce-123");

    const res = await POST(request({ wallet: "  Alice1  " }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, nonce: "nonce-123" });
    expect(generateLoginChallenge).toHaveBeenCalledWith("alice1");
  });

  it("maps an unexpected thrown error to a 500", async () => {
    vi.mocked(generateLoginChallenge).mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(request({ wallet: "alice1" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "Internal server error" });
  });
});
