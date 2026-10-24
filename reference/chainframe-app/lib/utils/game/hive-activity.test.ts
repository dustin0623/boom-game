import { describe, expect, it } from "vitest";
import type { NormalizedBlock } from "hivexph-sdk";
import { decodeHiveGameActivities } from "./hive-activity";
import { buildClaimAction } from "@/lib/utils/game/action-protocol";
import { parsePaymentMemo } from "./payment-protocol";

const game = (account: string) => [
  "custom_json",
  {
    id: "chainframe-game",
    required_auths: [],
    required_posting_auths: [account],
    json: JSON.stringify(buildClaimAction({ nonce: "fixture-123456" })),
  },
];
function block(operations: unknown[]): NormalizedBlock {
  return {
    blockNumber: 100,
    timestamp: "2026-10-10T00:00:00",
    transactions: [
      {
        transactionId: "tx",
        transactionIndex: 0,
        operations: operations.map((operation, operationIndex) => ({
          operation,
          operationIndex,
        })),
      },
    ],
  } as NormalizedBlock;
}
describe("worker Hive activity decoding", () => {
  it("routes native HIVE marketplace payments only to market, while treasury retains shop/registration", () => {
    const memo = JSON.stringify({
      action: "market_purchase",
      metadata: { itemId: "item" },
    });
    const native = (to: string, actionMemo = memo) => [
      "transfer",
      { from: "alice", to, amount: "0.100 HIVE", memo: actionMemo },
    ];
    const engine = [
      "custom_json",
      {
        id: "ssc-mainnet-hive",
        required_auths: ["alice"],
        required_posting_auths: [],
        json: JSON.stringify({
          contractName: "tokens",
          contractAction: "transfer",
          contractPayload: {
            to: "market",
            symbol: "HASH",
            quantity: "0.100",
            memo,
          },
        }),
      },
    ];
    const result = decodeHiveGameActivities(
      block([
        native("market"),
        native("treasury"),
        engine,
        native(
          "market",
          JSON.stringify({ action: "registration", metadata: {} }),
        ),
      ]),
      "treasury",
      "HASH",
      "market",
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "payment",
      to: "market",
      symbol: "HIVE",
      operationIndex: 0,
    });
  });
  it("shows all actors and all operations in a transaction", () => {
    const activities = decodeHiveGameActivities(
      block([game("alice"), game("bob")]),
      "treasury",
    );
    expect(
      activities.map((entry) =>
        entry.kind === "game" ? entry.event.account : entry.from,
      ),
    ).toEqual(["alice", "bob"]);
    expect(
      activities.map((entry) =>
        entry.kind === "game"
          ? entry.event.operationIndex
          : entry.operationIndex,
      ),
    ).toEqual([0, 1]);
  });
  it("does not generate activity for empty blocks or unrelated operations", () => {
    expect(decodeHiveGameActivities(block([]), "treasury")).toEqual([]);
    expect(
      decodeHiveGameActivities(
        block([
          [
            "transfer",
            {
              from: "alice",
              to: "treasury",
              amount: "1.000 HIVE",
              memo: "hello",
            },
          ],
          ["custom_json", { id: "other-app", json: "{}" }],
          // An otherwise valid old-brand submission is unsupported.
          [
            "custom_json",
            { ...(game("alice")[1] as object), id: "cryptocore-game" },
          ],
        ]),
        "treasury",
      ),
    ).toEqual([]);
  });
  it("preserves malformed game submissions for processor rejection", () => {
    const result = decodeHiveGameActivities(
      block([
        [
          "custom_json",
          {
            id: "chainframe-game",
            json: "{",
            required_posting_auths: ["alice"],
          },
        ],
      ]),
      "",
    );
    expect(result[0]).toMatchObject({
      kind: "game",
      event: { action: "invalid_action" },
    });
  });
  it("recognizes native registration and engine deposits using their actual signed sender", () => {
    const result = decodeHiveGameActivities(
      block([
        [
          "transfer",
          {
            from: "alice",
            to: "treasury",
            amount: "1.000 HIVE",
            memo: JSON.stringify({ action: "registration", metadata: {} }),
          },
        ],
        {
          type: "custom_json_operation",
          value: {
            id: "ssc-mainnet-hive",
            required_auths: ["bob"],
            required_posting_auths: [],
            json: JSON.stringify({
              contractName: "tokens",
              contractAction: "transfer",
              contractPayload: {
                to: "treasury",
                symbol: "HASH",
                quantity: "2.000",
                memo: '{"action":"deposit","metadata":{}}',
              },
            }),
          },
        },
      ]),
      "treasury",
    );
    expect(result).toMatchObject([
      {
        kind: "payment",
        from: "alice",
        symbol: "HIVE",
        paymentsInTransaction: 2,
      },
      {
        kind: "payment",
        from: "bob",
        symbol: "HASH",
        paymentsInTransaction: 2,
      },
    ]);
    expect(result.every((entry) => !("success" in entry))).toBe(true);
  });
  it("filters payments sent to another account", () => {
    expect(
      decodeHiveGameActivities(
        block([
          [
            "transfer",
            {
              from: "alice",
              to: "mallory",
              amount: "1.000 HIVE",
              memo: JSON.stringify({ action: "registration", metadata: {} }),
            },
          ],
        ]),
        "treasury",
      ),
    ).toEqual([]);
  });
});
describe("payment memo protocol", () => {
  it("round trips the SDK action/metadata memo", () => {
    const trigger = {
      action: "market_purchase",
      metadata: { itemId: "item-1" },
    } as const;
    expect(
      parsePaymentMemo(
        '{"action":"market_purchase","metadata":{"itemId":"item-1"}}',
      ),
    ).toEqual(trigger);
    expect(
      parsePaymentMemo(
        JSON.stringify({
          action: "shop_purchase",
          metadata: { kind: "chest", itemId: "equipment", quantity: 1 },
        }),
      ),
    ).toMatchObject({
      action: "shop_purchase",
      metadata: { kind: "chest", quantity: 1 },
    });
  });
  it.each([
    '{"action":"registration","metadata":{"reward":100}}',
    '{"action":"deposit","metadata":{},"actor":"mallory"}',
    "{",
    "CryptoCore shop bad-id x0",
  ])("rejects unsafe or unrelated memo %s", (memo) => {
    expect(parsePaymentMemo(memo)).toBeNull();
  });
});
