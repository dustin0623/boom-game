import { afterEach, describe, expect, it, vi } from "vitest";
import { HiveClient } from "hivexph-sdk";
import {
  cryptoUtils,
  PrivateKey,
  Signature,
  type SignedTransaction,
} from "@hiveio/dhive";

// Synthetic credentials only. All RPC calls are intercepted, including broadcast.
const key = PrivateKey.fromSeed("chainframe-native-signing-regression-fixture");
const properties = {
  head_block_number: 65537,
  head_block_id: "0001000111223344000000000000000000000000",
  time: "2026-01-01T00:00:00",
};
const envelope = {
  ref_block_num: 1,
  ref_block_prefix: 0x44332211,
  expiration: "2026-01-01T00:01:00",
  extensions: [],
};

function interceptedClient() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.reject(new Error("Unexpected network access in signing test")),
    ),
  );
  const client = new HiveClient({
    applicationId: "chainframe-game",
    accounts: {
      treasury: { account: "treasury", key: key.toString() },
      market: { account: "market", key: key.toString() },
    },
  });
  const broadcasts: SignedTransaction[] = [];
  const rpc = vi
    .spyOn(client.rpc, "call")
    .mockImplementation(async (method, params) => {
      if (method === "condenser_api.get_dynamic_global_properties")
        return properties as never;
      if (method === "condenser_api.broadcast_transaction_synchronous") {
        broadcasts.push((params as [SignedTransaction])[0]);
        return { id: "a".repeat(40) } as never;
      }
      throw new Error(`Unexpected intercepted RPC: ${method}`);
    });
  return { client, broadcasts, rpc };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("published SDK native transfer signing release gate", () => {
  it("signs the market-to-treasury fee using the exact native memo envelope", async () => {
    const { client, broadcasts } = interceptedClient();
    const memo = JSON.stringify({
      action: "withdrawal",
      metadata: { memo: "Chainframe marketplace fee signing-fixture" },
    });
    await client.payments.hive.transfer({
      from: client.accounts.market,
      account: "treasury",
      amount: "0.005",
      symbol: "HIVE",
      action: "withdrawal",
      metadata: { memo: "Chainframe marketplace fee signing-fixture" },
    });
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].operations).toEqual([
      [
        "transfer",
        { from: "market", to: "treasury", amount: "0.005 HIVE", memo },
      ],
    ]);
    const digest = cryptoUtils.transactionDigest(broadcasts[0]);
    const signature = Signature.fromString(broadcasts[0].signatures[0]);
    expect(key.createPublic().verify(digest, signature)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["issue", "transfer"] as const)(
    "verifies the published token %s API with the exact withdrawal memo",
    async (operation) => {
      const { client, broadcasts } = interceptedClient();
      const memo = JSON.stringify({
        action: "withdrawal",
        metadata: { memo: "Chainframe withdrawal signing-fixture" },
      });
      const input = {
        from: client.accounts.treasury,
        account: "alice",
        quantity: "10.000",
        symbol: "HASH",
        memo,
      };
      await client.issuer.token[operation](input);
      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0].operations).toEqual([
        [
          "custom_json",
          {
            required_auths: ["treasury"],
            required_posting_auths: [],
            id: "ssc-mainnet-hive",
            json: JSON.stringify({
              contractName: "tokens",
              contractAction: operation,
              contractPayload: {
                symbol: "HASH",
                to: "alice",
                quantity: "10.000",
                memo,
              },
            }),
          },
        ],
      ]);
      const digest = cryptoUtils.transactionDigest(broadcasts[0]);
      const signature = Signature.fromString(broadcasts[0].signatures[0]);
      expect(key.createPublic().verify(digest, signature)).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("verifies the unchanged Engine Custom JSON signing path as an independent control", async () => {
    const { client, broadcasts } = interceptedClient();
    const input = {
      from: client.accounts.treasury,
      account: "referrer",
      quantity: "1.000",
      symbol: "HASH",
      action: "withdrawal",
      metadata: { memo: "fixture" },
    };
    const preview = client.payments.engine.build(input);
    await client.payments.engine.transfer(input);
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].operations[0][0]).toBe("custom_json");
    expect(broadcasts[0]).toMatchObject({
      ...envelope,
      operations: [preview.operation],
    });
    const digest = cryptoUtils.transactionDigest(broadcasts[0]);
    const signature = Signature.fromString(broadcasts[0].signatures[0]);
    expect(key.createPublic().verify(digest, signature)).toBe(true);
    expect(signature.recover(digest).toString()).toBe(
      key.createPublic().toString(),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    ["HIVE", "7.500"],
    ["HIVE", "0.500"],
    ["HIVE", "0.005"],
    ["HBD", "0.500"],
  ] as const)(
    "signs %s %s against an independent Hive digest",
    async (symbol, amount) => {
      const { client, broadcasts, rpc } = interceptedClient();
      const metadata = { memo: "Chainframe referral registration fixture" };
      const result = await client.payments.hive.transfer({
        from: client.accounts.treasury,
        account: "referrer",
        amount,
        symbol,
        action: "refund",
        metadata,
      });
      expect(result).toMatchObject({
        success: true,
        transactionId: "a".repeat(40),
      });
      expect(broadcasts).toHaveLength(1);
      const expected: SignedTransaction = {
        ...envelope,
        operations: [
          [
            "transfer",
            {
              from: "treasury",
              to: "referrer",
              amount: `${amount} ${symbol}`,
              memo: JSON.stringify({ action: "refund", metadata }),
            },
          ],
        ],
        signatures: [],
      };
      expect(broadcasts[0]).toMatchObject({
        ...envelope,
        operations: expected.operations,
      });
      expect(broadcasts[0].signatures).toHaveLength(1);
      expect(rpc).toHaveBeenCalledTimes(2);
      expect(fetch).not.toHaveBeenCalled();
      // Test-only independent verifier. No alternative signer or serializer enters runtime.
      const digest = cryptoUtils.transactionDigest(expected);
      const signature = Signature.fromString(broadcasts[0].signatures[0]);
      expect(
        key.createPublic().verify(digest, signature),
        "The installed SDK signed a digest that differs from the independent Hive transaction fixture",
      ).toBe(true);
      expect(signature.recover(digest).toString()).toBe(
        key.createPublic().toString(),
      );
    },
  );
});
