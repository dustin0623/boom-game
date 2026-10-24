import { describe, it, expect, vi } from "vitest";
import { broadcastCustomJson } from "./action";
import { hiveChainConfig } from "../../../../config";
import type { HiveClient } from "../../../client";

function mockClient(available = true) {
  const customJson = vi.fn().mockResolvedValue({ success: true, transactionId: "tx-cj", raw: {} });
  const client = { keychain: { isAvailable: () => available, customJson } } as unknown as HiveClient;
  return { client, customJson };
}

describe("broadcastCustomJson", () => {
  it("broadcasts with the configured application id and posting authority", async () => {
    const { client, customJson } = mockClient();
    const res = await broadcastCustomJson({ username: "alice", action: "open_chest", metadata: { id: 1 }, client });
    expect(res).toMatchObject({ ok: true, data: { transactionId: "tx-cj", action: "open_chest" } });
    expect(customJson).toHaveBeenCalledWith(
      expect.objectContaining({ id: hiveChainConfig.applicationId, authority: "posting" }),
    );
  });

  it("accepts an explicit id and active authority", async () => {
    const { client, customJson } = mockClient();
    await broadcastCustomJson({ username: "alice", action: "claim", id: "other-app", authority: "active", client });
    expect(customJson).toHaveBeenCalledWith(expect.objectContaining({ id: "other-app", authority: "active" }));
  });

  it("normalizes missing metadata to null", async () => {
    const { client, customJson } = mockClient();
    await broadcastCustomJson({ username: "alice", action: "claim", client });
    expect(customJson).toHaveBeenCalledWith(expect.objectContaining({ metadata: null }));
  });

  it("rejects an empty action", async () => {
    const { client } = mockClient();
    expect((await broadcastCustomJson({ username: "alice", action: "  ", client })).ok).toBe(false);
  });

  it("fails when Keychain is unavailable", async () => {
    const { client } = mockClient(false);
    expect((await broadcastCustomJson({ username: "alice", action: "claim", client })).ok).toBe(false);
  });

  it("surfaces a cancelled signature", async () => {
    const { client, customJson } = mockClient();
    customJson.mockRejectedValue(new Error("User cancelled"));
    expect(await broadcastCustomJson({ username: "alice", action: "claim", client })).toMatchObject({
      ok: false,
      error: "User cancelled",
    });
  });
});
