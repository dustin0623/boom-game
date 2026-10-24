import { hiveClient } from "../../../client";
import { normalizeHiveError, HiveOperationError } from "@/lib/utils/hive/error";
import {
  normalizeHiveUsername,
  tokenQuantityUnits,
} from "@/lib/utils/hive/validation";
import { z } from "zod";

const tokenSchema = z.object({
  symbol: z.string(),
  issuer: z.string(),
  precision: z.number().int().min(0).max(8),
  supply: z.string(),
  maxSupply: z.string(),
});
const balanceSchema = z.object({
  account: z.string(),
  symbol: z.string(),
  balance: z.string(),
});

/** Read-only asset evidence; callers own any payout policy. */
export async function getTokenState(account: string, symbol: string) {
  account = normalizeHiveUsername(account);
  try {
    const [rawToken, rawBalance] = await Promise.all([
      hiveClient.payments.engineRpc.findOne({
        contract: "tokens",
        table: "tokens",
        query: { symbol },
      }),
      hiveClient.payments.engineRpc.findOne({
        contract: "tokens",
        table: "balances",
        query: { account, symbol },
      }),
    ]);
    const token = tokenSchema.parse(rawToken);
    const balance =
      rawBalance === null ? null : balanceSchema.parse(rawBalance);
    if (
      token.symbol !== symbol ||
      (balance && (balance.account !== account || balance.symbol !== symbol))
    )
      throw new HiveOperationError(
        "VERIFICATION_FAILED",
        "Token state identity mismatch",
      );
    normalizeHiveUsername(token.issuer);
    const supply = tokenQuantityUnits(token.supply, token.precision);
    const maxSupply = tokenQuantityUnits(token.maxSupply, token.precision);
    if (supply > maxSupply)
      throw new HiveOperationError(
        "VERIFICATION_FAILED",
        "Invalid token supply",
      );
    tokenQuantityUnits(balance?.balance ?? "0", token.precision);
    return { ...token, balance: balance?.balance ?? "0" };
  } catch (error) {
    throw normalizeHiveError(error);
  }
}
