import type { TokenIssueInput } from "hivexph-sdk";
import { hiveClient } from "../../../client";
import {
  normalizeHiveUsername,
  validateQuantity,
} from "@/lib/utils/hive/validation";
import { normalizeHiveError } from "@/lib/utils/hive/error";

/** Uses the published issuer APIs; a returned ID is submission only. */
export async function sendTokenOperation(
  input: TokenIssueInput & { operation: "transfer" | "issue" },
) {
  const account = normalizeHiveUsername(input.account);
  validateQuantity(input.quantity, 8, input.symbol);
  const { operation, ...payload } = input;
  try {
    return operation === "issue"
      ? await hiveClient.issuer.token.issue({ ...payload, account })
      : await hiveClient.issuer.token.transfer({ ...payload, account });
  } catch (error) {
    throw normalizeHiveError(error);
  }
}
