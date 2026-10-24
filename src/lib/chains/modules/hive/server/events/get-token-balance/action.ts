import { z } from "zod";
import { getHiveClient, type HiveClient } from "../../../client";
import { HiveAccountSchema, SymbolSchema, ok, fail, type HiveActionResult } from "../../../types";


export const GetTokenBalanceInput = z.object({
  account: HiveAccountSchema,
  /** "HIVE" / "HBD" read Layer 1; anything else reads Hive Engine. */
  symbol: SymbolSchema,
  client: z.custom<HiveClient>().optional(),
});

export type GetTokenBalanceInput = z.input<typeof GetTokenBalanceInput>;

/** HIVE/HBD are Layer 1 assets; any other symbol rides Hive Engine (Layer 2). */
const isNativeSymbol = (symbol: string) => symbol === "HIVE" || symbol === "HBD";


export type TokenBalance = {
  account: string;
  symbol: string;
  /** Liquid balance as a decimal string. */
  balance: string;
  /** Staked balance, Hive Engine only. */
  stake: string | null;
  layer: 1 | 2;
};

type HiveAccountRow = { name: string; balance: string; hbd_balance: string };
type EngineBalanceRow = { balance?: string; stake?: string };

/** Read a HIVE/HBD or Hive Engine token balance for an account. */
export async function getTokenBalance(input: GetTokenBalanceInput): Promise<HiveActionResult<TokenBalance>> {
  const parsed = GetTokenBalanceInput.safeParse(input);
  if (!parsed.success) return fail(new Error(parsed.error.issues[0]?.message ?? "Invalid input"));

  const { account, symbol } = parsed.data;
  const hive = parsed.data.client ?? getHiveClient();

  try {
    if (isNativeSymbol(symbol)) {
      const rows = await hive.rpc.call<HiveAccountRow[]>("condenser_api.get_accounts", [[account]]);
      const row = rows?.[0];
      if (!row) return fail(new Error(`Hive account "${account}" not found`));
      const asset = symbol === "HIVE" ? row.balance : row.hbd_balance;
      return ok({ account, symbol, balance: asset?.split(" ")[0] ?? "0", stake: null, layer: 1 });
    }

    const row = await hive.payments.engineRpc.findOne<EngineBalanceRow>({
      contract: "tokens",
      table: "balances",
      query: { account, symbol },
    });
    return ok({
      account,
      symbol,
      balance: row?.balance ?? "0",
      stake: row?.stake ?? "0",
      layer: 2,
    });
  } catch (error) {
    return fail(error);
  }
}
