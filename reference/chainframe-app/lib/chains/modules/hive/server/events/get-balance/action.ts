import { hiveClient } from "../../../client";
import { normalizeHiveUsername } from "@/lib/utils/hive/validation";
import { HiveOperationError, normalizeHiveError } from "@/lib/utils/hive/error";
import { parseAsset } from "@/lib/utils/hive/payment";
import type { HiveBalance } from "../../types";

export async function getBalance(
  username: string,
  symbol: string,
  precision: number,
): Promise<HiveBalance> {
  const account = normalizeHiveUsername(username);
  try {
    const accounts = await hiveClient.rpc.call<
      Array<{ name: string; balance?: string }>
    >("condenser_api.get_accounts", [[account]]);
    if (!accounts[0] || accounts[0].name !== account)
      throw new HiveOperationError(
        "ACCOUNT_NOT_FOUND",
        "Hive account not found: " + account,
      );
    const token =
      symbol === "HIVE"
        ? null
        : await hiveClient.payments.engineRpc.findOne<{
            symbol?: string;
            balance?: string;
          }>({
            contract: "tokens",
            table: "balances",
            query: { account, symbol },
          });
    return {
      hive: parseAsset(accounts[0].balance),
      hbd: "0",
      token: token?.symbol === symbol ? (token.balance ?? "0") : "0",
      symbol,
      precision: { hive: 3, hbd: 3, token: precision },
    };
  } catch (error) {
    throw normalizeHiveError(error);
  }
}
