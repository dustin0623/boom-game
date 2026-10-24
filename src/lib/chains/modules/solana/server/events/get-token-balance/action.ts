import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { getSolanaClient, type SolanaClient } from "../../../client";
import {
  SolanaAddressSchema,
  SolanaSymbolSchema,
  LAMPORTS_PER_SOL,
  fromBaseUnits,
  ok,
  fail,
  type SolanaActionResult,
} from "../../../types";

export const GetTokenBalanceInput = z.object({
  /** Wallet address to read. */
  address: SolanaAddressSchema,
  /** "SOL" reads the native balance; any other value is treated as an SPL mint. */
  symbol: SolanaSymbolSchema.default("SOL"),
  client: z.custom<SolanaClient>().optional(),
});

export type GetTokenBalanceInput = z.input<typeof GetTokenBalanceInput>;

export type SolanaTokenBalance = {
  address: string;
  /** "SOL" or the SPL mint address. */
  symbol: string;
  /** Liquid balance as a decimal string. */
  balance: string;
  decimals: number;
  /** Raw integer amount in base units (lamports for SOL). */
  raw: string;
  /** Number of SPL token accounts summed (0 for native SOL). */
  accounts: number;
};

/** Read a native SOL balance or an SPL token balance on mainnet. */
export async function getTokenBalance(
  input: GetTokenBalanceInput,
): Promise<SolanaActionResult<SolanaTokenBalance>> {
  const parsed = GetTokenBalanceInput.safeParse(input);
  if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? "Invalid input"));

  const { address, symbol } = parsed.data;
  const solana = parsed.data.client ?? getSolanaClient();

  try {
    const owner = new PublicKey(address);

    if (symbol === "SOL") {
      const lamports = await solana.getBalance(owner);
      return ok({
        address,
        symbol,
        balance: fromBaseUnits(lamports, 9),
        decimals: 9,
        raw: String(lamports),
        accounts: 0,
      });
    }

    const { value } = await solana.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(symbol) });

    let raw = 0n;
    let decimals = 0;
    for (const account of value) {
      const info = (
        account.account.data as unknown as {
          parsed?: { info?: { tokenAmount?: { amount?: string; decimals?: number } } };
        }
      ).parsed?.info?.tokenAmount;
      raw += BigInt(info?.amount ?? "0");
      decimals = info?.decimals ?? decimals;
    }

    return ok({
      address,
      symbol,
      balance: fromBaseUnits(raw, decimals),
      decimals,
      raw: raw.toString(),
      accounts: value.length,
    });
  } catch (error) {
    return fail(error);
  }
}

export { LAMPORTS_PER_SOL };
