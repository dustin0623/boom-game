import { beforeEach, describe, expect, it, vi } from "vitest";
import { HiveClient } from "hivexph-sdk";
import { hiveClient } from "@/lib/chains/modules/hive/client";
vi.mock("@/lib/config/config", () => ({
  config: {
    blockchain: { treasuryAccount: "treasury", marketAccount: "market" },
  },
}));
const m = vi.hoisted(() => ({
  native: vi.fn(),
  token: vi.fn(),
  operation: vi.fn(),
  once: vi.fn(),
}));
vi.mock(
  "@/lib/chains/modules/hive/server/events/send-token-operation/action",
  () => ({ sendTokenOperation: m.operation }),
);
vi.mock(
  "@/lib/chains/modules/hive/server/events/transfer-native/action",
  () => ({ transferNative: m.native }),
);
vi.mock(
  "@/lib/chains/modules/hive/server/events/transfer-token/action",
  () => ({ transferToken: m.token }),
);
vi.mock("./dispatch-once.server", () => ({ dispatchTreasuryOnce: m.once }));
import { dispatchTreasuryTransfer } from "./dispatch";
const preview = new HiveClient({
  accounts: {
    treasury: { account: "treasury" },
    market: { account: "market" },
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(hiveClient, "resolveAccount").mockImplementation(
    (alias) => ({ account: alias }) as never,
  );
  m.once.mockImplementation(async (_job, _key, _intent, send) => send());
  m.native.mockResolvedValue({ success: true, transactionId: "native" });
  m.token.mockResolvedValue({ success: true, transactionId: "token" });
});
describe("treasury workflow uses explicit general transfers", () => {
  it.each(["issue", "transfer"] as const)(
    "journals explicit %s and passes the exact memo to the issuer event",
    async (operation) => {
      await dispatchTreasuryTransfer(
        { checkLease: async () => {} } as never,
        "job",
        "key",
        "alice",
        "10.000",
        "HASH",
        "Chainframe withdrawal origin",
        "treasury",
        undefined,
        operation,
      );
      expect(m.once).toHaveBeenCalledWith(
        "job",
        "key",
        expect.objectContaining({
          operation,
          from: "treasury",
          quantity: "10.000",
        }),
        expect.any(Function),
      );
      expect(m.operation).toHaveBeenCalledExactlyOnceWith({
        from: hiveClient.accounts.treasury,
        operation,
        account: "alice",
        quantity: "10.000",
        symbol: "HASH",
        memo: '{"action":"withdrawal","metadata":{"memo":"Chainframe withdrawal origin"}}',
      });
      expect(m.token).not.toHaveBeenCalled();
      expect(m.native).not.toHaveBeenCalled();
    },
  );
  it.each(["sale", "refund"])(
    "preserves the existing marketplace %s memo bytes after switching to native HIVE",
    async (kind) => {
      const memo = `Chainframe marketplace ${kind} origin`;
      await dispatchTreasuryTransfer(
        { checkLease: async () => {} } as never,
        "job",
        kind + ":key",
        "alice",
        "0.100",
        "HIVE",
        memo,
        "market",
        "market",
      );
      const input = m.native.mock.calls[0][0];
      const built = preview.payments.hive.build({
        ...input,
        from: preview.accounts.market,
      });
      expect(built.memo).toBe(
        `{"action":"withdrawal","metadata":{"memo":"Chainframe marketplace ${kind} origin"}}`,
      );
      expect(built.account).toBe("market");
      expect(built.amount).toBe("0.100 HIVE");
    },
  );
  it("refuses an SDK alias/configuration mismatch before claiming or broadcasting", async () => {
    vi.mocked(hiveClient.resolveAccount).mockReturnValue({
      account: "other-market",
    } as never);
    await expect(
      dispatchTreasuryTransfer(
        { checkLease: async () => {} } as never,
        "job",
        "key",
        "seller",
        "0.095",
        "HIVE",
        "memo",
        "market",
        "market",
      ),
    ).rejects.toThrow(/SDK signing account/);
    expect(m.once).not.toHaveBeenCalled();
    expect(m.native).not.toHaveBeenCalled();
  });
  it("claims explicit market routing and signs a native seller payout using that alias", async () => {
    await dispatchTreasuryTransfer(
      { checkLease: async () => {} } as never,
      "job",
      "sale:key",
      "seller",
      "0.095",
      "HIVE",
      "Chainframe marketplace sale origin",
      "market",
      "market",
    );
    expect(m.once).toHaveBeenCalledWith(
      "job",
      "sale:key",
      expect.objectContaining({
        from: "market",
        accountAlias: "market",
        to: "seller",
        quantity: "0.095",
        symbol: "HIVE",
      }),
      expect.any(Function),
    );
    expect(m.native).toHaveBeenCalledWith(
      expect.objectContaining({
        from: hiveClient.accounts.market,
        account: "seller",
        amount: "0.095",
        action: "withdrawal",
      }),
    );
    expect(m.token).not.toHaveBeenCalled();
  });
  it("parks changed market routing before a durable claim or broadcast", async () => {
    await expect(
      dispatchTreasuryTransfer(
        { checkLease: async () => {} } as never,
        "job",
        "key",
        "seller",
        "0.095",
        "HIVE",
        "memo",
        "market",
        "old-market",
      ),
    ).rejects.toThrow(/Signing account/);
    expect(m.once).not.toHaveBeenCalled();
    expect(m.native).not.toHaveBeenCalled();
  });
  it("preserves native refunds' exact SDK memo envelope and explicit parent identity", async () => {
    const checkLease = vi.fn(async () => {});
    await dispatchTreasuryTransfer(
      { checkLease } as never,
      "job",
      "refund:key",
      "alice",
      "1.000",
      "HIVE",
      "registration refund",
    );
    expect(m.once).toHaveBeenCalledWith(
      "job",
      "refund:key",
      {
        to: "alice",
        from: "treasury",
        accountAlias: "treasury",
        quantity: "1.000",
        symbol: "HIVE",
        memo: "registration refund",
      },
      expect.any(Function),
    );
    expect(m.native).toHaveBeenCalledExactlyOnceWith({
      from: hiveClient.accounts.treasury,
      account: "alice",
      amount: "1.000",
      symbol: "HIVE",
      action: "refund",
      metadata: { memo: "registration refund" },
    });
    const input = m.native.mock.calls[0][0];
    expect(
      preview.payments.hive.build({ ...input, from: preview.accounts.treasury })
        .memo,
    ).toBe('{"action":"refund","metadata":{"memo":"registration refund"}}');
    expect(checkLease).toHaveBeenCalledTimes(2);
  });
  it("preserves token payouts' envelope and uses the recorded asset", async () => {
    await dispatchTreasuryTransfer(
      { checkLease: async () => {} } as never,
      "job",
      "payout:key",
      "alice",
      "2.000",
      "HASH",
      "market seller",
    );
    expect(m.token).toHaveBeenCalledExactlyOnceWith({
      from: hiveClient.accounts.treasury,
      account: "alice",
      quantity: "2.000",
      symbol: "HASH",
      action: "withdrawal",
      metadata: { memo: "market seller" },
    });
    const input = m.token.mock.calls[0][0];
    const built = preview.payments.engine.build({
      ...input,
      from: preview.accounts.treasury,
    });
    expect(JSON.parse(built.json).contractPayload.memo).toBe(
      '{"action":"withdrawal","metadata":{"memo":"market seller"}}',
    );
    expect(m.native).not.toHaveBeenCalled();
  });
  it("does not enter dispatch after lease loss", async () => {
    await expect(
      dispatchTreasuryTransfer(
        {
          checkLease: async () => {
            throw Error("lease lost");
          },
        } as never,
        "job",
        "key",
        "alice",
        "1.000",
        "HIVE",
        "refund",
      ),
    ).rejects.toThrow("lease lost");
    expect(m.once).not.toHaveBeenCalled();
    expect(m.native).not.toHaveBeenCalled();
  });
});
