import { describe, expect, it } from "vitest";
import { HiveClient } from "hivexph-sdk";
import { EQUIPMENT_CHEST_ID } from "@/lib/config/constants/game";
import {
  getPaymentTrigger,
  parsePaymentMemo,
  type ChainframePaymentTrigger,
} from "./payment-protocol";
const preview = new HiveClient({
  accounts: { treasury: { account: "treasury" } },
});
describe("Chainframe payment contracts", () => {
  it.each([
    ["CryptoCore registration", { action: "registration", metadata: {} }],
    ["CryptoCore deposit", { action: "deposit", metadata: {} }],
    [
      "CryptoCore shop " + EQUIPMENT_CHEST_ID + " x1",
      {
        action: "shop_purchase",
        metadata: { kind: "chest", itemId: EQUIPMENT_CHEST_ID, quantity: 1 },
      },
    ],
  ])(
    "rejects unsupported plain-text memo %s and preserves current SDK serialization",
    (memo, expected) => {
      expect(parsePaymentMemo(memo)).toBeNull();
      const trigger = parsePaymentMemo(JSON.stringify(expected));
      expect(trigger).toEqual(expected);
      if (!trigger) throw Error("Invalid fixture");
      const built = preview.payments.hive.build<Record<string, unknown>>({
        from: preview.accounts.treasury,
        account: "alice",
        amount: "1.000",
        symbol: "HIVE",
        ...trigger,
      });
      expect(built.memo).toBe(JSON.stringify(expected));
    },
  );
  it("retains the token deposit and marketplace payloads", () => {
    const payments: Array<{ intent: ChainframePaymentTrigger; memo: string }> =
      [
        {
          intent: { action: "deposit", metadata: {} },
          memo: '{"action":"deposit","metadata":{}}',
        },
        {
          intent: { action: "market_purchase", metadata: { itemId: "item-1" } },
          memo: '{"action":"market_purchase","metadata":{"itemId":"item-1"}}',
        },
      ];
    for (const { intent, memo } of payments) {
      const built = preview.payments.engine.build<Record<string, unknown>>({
        from: preview.accounts.treasury,
        account: "alice",
        quantity: "5.000",
        symbol: "HASH",
        ...intent,
      });
      expect(JSON.parse(built.json).contractPayload.memo).toBe(memo);
      expect(parsePaymentMemo(memo)).toEqual(intent);
    }
  });
  it("interprets raw memo first and retains SDK evidence normalization", () => {
    expect(
      getPaymentTrigger({
        memo: JSON.stringify({ action: "deposit", metadata: {} }),
        trigger: { action: "registration", metadata: {} },
      })?.action,
    ).toBe("deposit");
    expect(
      getPaymentTrigger({
        trigger: { action: "market_purchase", metadata: { itemId: "one" } },
      }),
    ).toEqual({ action: "market_purchase", metadata: { itemId: "one" } });
    expect(
      getPaymentTrigger({
        memo: "invalid",
        trigger: { action: "unrecognized", metadata: {} },
      }),
    ).toBeNull();
  });
});
