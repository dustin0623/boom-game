import { describe, it, expect, vi } from "vitest";
import { getTransaction } from "./action";
import type { HiveClient } from "../../../client";

const TXID = "7b064a84a968caddd2496f3270f0cecafb954217";

function mockClient(result: unknown = { transactionId: TXID, operations: [] }) {
  const transaction = vi.fn().mockResolvedValue(result);
  return { client: { reader: { transaction } } as unknown as HiveClient, transaction };
}

describe("getTransaction", () => {
  it("reads a transaction by id", async () => {
    const { client } = mockClient();
    const res = await getTransaction({ transactionId: TXID, client });
    expect(res.ok).toBe(true);
  });

  it("passes id and action filters through", async () => {
    const { client, transaction } = mockClient();
    await getTransaction({ transactionId: TXID, id: "my-app", actions: ["buy"], client });
    expect(transaction).toHaveBeenCalledWith({ transactionId: TXID, id: "my-app", actions: ["buy"] });
  });

  it("rejects a malformed transaction id", async () => {
    const { client } = mockClient();
    expect((await getTransaction({ transactionId: "nope", client })).ok).toBe(false);
  });

  it("surfaces reader failures", async () => {
    const { client, transaction } = mockClient();
    transaction.mockRejectedValue(new Error("not found"));
    expect(await getTransaction({ transactionId: TXID, client })).toMatchObject({ ok: false, error: "not found" });
  });
});
