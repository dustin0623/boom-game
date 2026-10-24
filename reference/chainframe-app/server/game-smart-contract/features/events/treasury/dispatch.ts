import { dispatchTreasuryOnce } from "@/server/game-smart-contract/features/events/treasury/dispatch-once.server";
import { transferNative } from "@/lib/chains/modules/hive/server/events/transfer-native/action";
import { transferToken } from "@/lib/chains/modules/hive/server/events/transfer-token/action";
import { sendTokenOperation } from "@/lib/chains/modules/hive/server/events/send-token-operation/action";
import type { SettlementContext } from "@/server/game-smart-contract/features/types/settlement";
import { hiveClient } from "@/lib/chains/modules/hive/client";
import { config } from "@/lib/config/config";
import { SettlementUncertainError } from "./errors.server";

export async function dispatchTreasuryTransfer(
  context: SettlementContext,
  jobSignature: string,
  key: string,
  to: string,
  quantity: string,
  symbol: string,
  memo: string,
  accountAlias: "treasury" | "market" = "treasury",
  expectedFrom?: string,
  operation?: "transfer" | "issue",
) {
  await context.checkLease();
  if (
    operation !== undefined &&
    (accountAlias !== "treasury" || symbol === "HIVE" || symbol === "HBD")
  )
    throw new SettlementUncertainError("Unsupported token payout routing");
  const from =
    accountAlias === "market"
      ? config.blockchain.marketAccount
      : config.blockchain.treasuryAccount;
  if (!from || (expectedFrom && from !== expectedFrom))
    throw new SettlementUncertainError(
      "Signing account no longer matches recorded payment routing",
    );
  // Alias resolution is key-free; record the exact sender the SDK will use.
  let resolvedFrom: string;
  try {
    resolvedFrom = hiveClient.resolveAccount(accountAlias).account;
  } catch {
    throw new SettlementUncertainError(
      "Cannot resolve configured signing account",
    );
  }
  if (resolvedFrom !== from)
    throw new SettlementUncertainError(
      "SDK signing account differs from configured payment routing",
    );
  return dispatchTreasuryOnce(
    jobSignature,
    key,
    {
      to,
      quantity,
      symbol,
      memo,
      from: resolvedFrom,
      accountAlias,
      ...(operation !== undefined ? { operation } : {}),
    },
    async () => {
      await context.checkLease();
      if (operation !== undefined)
        return sendTokenOperation({
          from: hiveClient.accounts[accountAlias],
          account: to,
          quantity,
          symbol,
          operation,
          memo: JSON.stringify({ action: "withdrawal", metadata: { memo } }),
        });
      // Preserve the existing outgoing SDK action/metadata memo envelope.
      return symbol === "HIVE" || symbol === "HBD"
        ? transferNative({
            from: hiveClient.accounts[accountAlias],
            account: to,
            amount: quantity,
            symbol: symbol as "HIVE" | "HBD",
            action: accountAlias === "market" ? "withdrawal" : "refund",
            metadata: { memo },
          })
        : transferToken({
            from: hiveClient.accounts[accountAlias],
            account: to,
            quantity,
            symbol,
            action: "withdrawal",
            metadata: { memo },
          });
    },
  );
}
