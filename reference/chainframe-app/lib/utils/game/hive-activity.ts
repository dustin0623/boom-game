import type { CustomJsonEvent, NormalizedBlock } from "hivexph-sdk";
import { GAME_ACTION_CUSTOM_JSON_ID } from "@/lib/chains/modules/hive/client";
import {
  parsePaymentMemo,
  type ChainframePaymentTrigger,
} from "@/lib/utils/game/payment-protocol";
import { readHiveOperation } from "@/lib/utils/hive/operation";
export type ObservedPayment = {
  kind: "payment";
  paymentsInTransaction: number;
  transactionId: string | null;
  operationIndex: number;
  transactionIndex: number;
  blockNumber: number;
  blockTimestamp: string;
  from: string;
  to: string;
  symbol: string;
  quantity: string;
  trigger: ChainframePaymentTrigger;
};
export type HiveGameActivity =
  { kind: "game"; event: CustomJsonEvent } | ObservedPayment;

/** Pure worker intake decoding; execution and settlement are verified separately. */
export function decodeHiveGameActivities(
  block: NormalizedBlock,
  treasury: string,
  token = "HASH",
  market = "",
): HiveGameActivity[] {
  const entries: HiveGameActivity[] = [];
  for (const tx of block.transactions)
    for (const operation of tx.operations) {
      const op = readHiveOperation(operation.operation);
      if (!op) continue;
      const value = op.value;
      if (
        op.name === "custom_json" &&
        value.id === GAME_ACTION_CUSTOM_JSON_ID
      ) {
        let json: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(String(value.json));
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
            json = parsed;
        } catch {
          /* retain malformed game submissions for processor rejection */
        }
        const requiredAuths = Array.isArray(value.required_auths)
          ? value.required_auths.filter(
              (item): item is string => typeof item === "string",
            )
          : [];
        const requiredPostingAuths = Array.isArray(value.required_posting_auths)
          ? value.required_posting_auths.filter(
              (item): item is string => typeof item === "string",
            )
          : [];
        entries.push({
          kind: "game",
          event: {
            eventId: `${block.blockNumber}-${tx.transactionIndex}-${operation.operationIndex}`,
            transactionId: tx.transactionId,
            blockNumber: block.blockNumber,
            blockTimestamp: block.timestamp,
            transactionIndex: tx.transactionIndex,
            operationIndex: operation.operationIndex,
            account: requiredPostingAuths[0] ?? requiredAuths[0] ?? null,
            id: GAME_ACTION_CUSTOM_JSON_ID,
            action:
              typeof json.action === "string" ? json.action : "invalid_action",
            metadata:
              json.metadata &&
              typeof json.metadata === "object" &&
              !Array.isArray(json.metadata)
                ? (json.metadata as Record<string, unknown>)
                : null,
            requiredAuths,
            requiredPostingAuths,
            raw: operation.operation,
          },
        });
        continue;
      }
      let from: unknown,
        to: unknown,
        symbol: unknown,
        quantity: unknown,
        memo: unknown;
      if (op.name === "transfer") {
        const asset = /^(\d+\.\d{3}) (HIVE|HBD)$/.exec(String(value.amount));
        if (!asset) continue;
        [quantity, symbol] = [asset[1], asset[2]];
        from = value.from;
        to = value.to;
        memo = value.memo;
      } else if (op.name === "custom_json" && value.id === "ssc-mainnet-hive") {
        try {
          const payload = JSON.parse(String(value.json));
          if (
            payload.contractName !== "tokens" ||
            payload.contractAction !== "transfer"
          )
            continue;
          const data = payload.contractPayload;
          if (
            !data ||
            data.symbol !== token ||
            !Array.isArray(value.required_auths) ||
            value.required_auths.length !== 1
          )
            continue;
          from = value.required_auths[0];
          to = data.to;
          symbol = data.symbol;
          quantity = data.quantity;
          memo = data.memo;
        } catch {
          continue;
        }
      } else continue;
      const trigger = parsePaymentMemo(memo);
      const recipient =
        trigger?.action === "market_purchase" ? market : treasury;
      const expectedSymbol = trigger?.action === "deposit" ? token : "HIVE";
      if (
        !trigger ||
        !recipient ||
        to !== recipient ||
        symbol !== expectedSymbol ||
        typeof from !== "string" ||
        typeof symbol !== "string" ||
        typeof quantity !== "string" ||
        !/^\d+(?:\.\d+)?$/.test(quantity) ||
        Number(quantity) <= 0
      )
        continue;
      entries.push({
        kind: "payment",
        paymentsInTransaction: 1,
        transactionIndex: tx.transactionIndex,
        transactionId: tx.transactionId,
        operationIndex: operation.operationIndex,
        blockNumber: block.blockNumber,
        blockTimestamp: block.timestamp,
        from,
        to: recipient,
        symbol,
        quantity,
        trigger,
      });
    }
  for (const entry of entries)
    if (entry.kind === "payment")
      entry.paymentsInTransaction = entries.filter(
        (other) =>
          other.kind === "payment" &&
          other.transactionId === entry.transactionId,
      ).length;
  return entries;
}
