import { hiveClient } from "../../../client";
import { normalizeHiveUsername } from "@/lib/utils/hive/validation";
import { HiveOperationError, normalizeHiveError } from "@/lib/utils/hive/error";
import type { HivePostingAuthority } from "../../types";

export async function getAccountAuthority(
  username: string,
): Promise<HivePostingAuthority> {
  const account = normalizeHiveUsername(username);
  try {
    const accounts = await hiveClient.rpc.call<
      Array<{ name: string; posting: HivePostingAuthority }>
    >("condenser_api.get_accounts", [[account]]);
    if (accounts[0]?.name !== account || !accounts[0]?.posting)
      throw new HiveOperationError(
        "ACCOUNT_NOT_FOUND",
        "Hive account not found",
      );
    return accounts[0].posting;
  } catch (error) {
    throw normalizeHiveError(error);
  }
}
