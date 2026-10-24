import { describe, it, expect } from "vitest";
import { getTokenBalance } from "./action";
import type { SolanaClient } from "../../../client";

const OWNER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const mock = (impl: Partial<SolanaClient>) => impl as unknown as SolanaClient;

describe("solana get-token-balance", () => {
  it("reads a native SOL balance from lamports", async () => {
    const client = mock({ getBalance: async () => 1_500_000_000 });
    const res = await getTokenBalance({ address: OWNER, symbol: "SOL", client });
    expect(res.ok && res.data).toMatchObject({ balance: "1.5", decimals: 9, raw: "1500000000" });
  });

  it("sums SPL token accounts for a mint", async () => {
    const account = (amount: string, decimals: number) => ({
      account: { data: { parsed: { info: { tokenAmount: { amount, decimals } } } } },
    });
    const client = mock({
      getParsedTokenAccountsByOwner: async () =>
        ({ value: [account("2500000", 6), account("1500000", 6)] }) as never,
    });
    const res = await getTokenBalance({ address: OWNER, symbol: MINT, client });
    expect(res.ok && res.data).toMatchObject({ balance: "4", decimals: 6, accounts: 2 });
  });

  it("returns zero when the owner holds no token account", async () => {
    const client = mock({ getParsedTokenAccountsByOwner: async () => ({ value: [] }) as never });
    const res = await getTokenBalance({ address: OWNER, symbol: MINT, client });
    expect(res.ok && res.data.balance).toBe("0");
  });

  it("rejects an invalid address", async () => {
    const res = await getTokenBalance({ address: "nope", symbol: "SOL" });
    expect(res.ok).toBe(false);
  });

  it("reports RPC failures instead of throwing", async () => {
    const client = mock({
      getBalance: async () => {
        throw new Error("429 Too Many Requests");
      },
    });
    const res = await getTokenBalance({ address: OWNER, client });
    expect(res).toMatchObject({ ok: false, error: "429 Too Many Requests" });
  });
});
