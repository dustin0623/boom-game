import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/modules/transactions-processed/server.repository", () => ({
  listProcessedHistory: vi.fn(),
  readAnalyticsReceipts: vi.fn(async () => []),
}));
vi.mock("@/lib/modules/transactions-pending/server.repository", () => ({
  findPendingByWallet: vi.fn(async () => []),
}));
import { requireSession } from "@/lib/auth/session";
import { listProcessedHistory } from "@/lib/modules/transactions-processed/server.repository";
import { GET } from "./route";
const list = vi.mocked(listProcessedHistory);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue({
    wallet: "alice",
    username: "alice",
  });
  list.mockResolvedValue({
    history: [],
    nextCursor: null,
    latestCursor: null,
  });
});
describe("personal history boundary", () => {
  const request = (query = "") =>
    new Request("http://localhost/api/transactions" + query);
  it("requires authentication", async () => {
    vi.mocked(requireSession).mockResolvedValue(
      Response.json({}, { status: 401 }),
    );
    expect((await GET(request())).status).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });
  it("validates limits and cursors", async () => {
    for (const query of [
      "?limit=101",
      "?limit=abc",
      "?cursor=bad",
      "?direction=bad",
    ])
      expect((await GET(request(query))).status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });
  it("queries only the authenticated wallet and serializes its page", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith("alice", {
      limit: 25,
      direction: "older",
      cursor: undefined,
    });
    expect((await response.json()).ok).toBe(true);
  });
  it("does not expose infrastructure failures", async () => {
    list.mockRejectedValue(new Error("secret"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});
