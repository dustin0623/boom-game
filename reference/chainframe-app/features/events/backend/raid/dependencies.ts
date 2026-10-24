import type { CustomJsonEvent } from "hivexph-sdk";
import { validateGameActionSubmission } from "@/lib/utils/game/action-validation";
import { gameEventKey } from "@/lib/utils/game/event-identity.server";
import { readQueuedGameBatches } from "@/lib/modules/transactions-pending/server.repository";
import { playerRepository } from "@/lib/modules/players/server.repository";
import { findEquipmentById } from "@/lib/modules/equipments/server.repository";
import { getProcessedTransaction } from "@/lib/modules/transactions-processed/server.repository";
import { setPaymentDependencies } from "@/lib/modules/transactions-pending/server.repository";
import type { IInboundTransaction } from "@/lib/modules/transactions-pending/server.types";

export class GameplayDependencyHold extends Error {
  constructor() {
    super("Waiting for earlier gameplay");
    this.name = "GameplayDependencyHold";
  }
}

export async function holdPaymentFulfillment(
  job: IInboundTransaction,
  recordedOnly = false,
): Promise<boolean> {
  // Withdrawal creation is gated in signed gameplay; queued payouts already own reservations.
  if (job.type === "withdrawal") return false;
  // Proven reservations and completed primary receipts keep their existing financial recovery.
  if (
    ["reserved", "refund", "rejected"].includes(job.financialPhase ?? "") ||
    (await getProcessedTransaction(job.signature))
  )
    return false;
  const participants = [job.walletAddress];
  if (job.type === "market_purchase") {
    const seller =
      job.marketSettlement?.seller ??
      (!recordedOnly && job.itemId
        ? (await findEquipmentById(job.itemId))?.owner
        : undefined);
    if (seller) participants.push(seller);
  }
  if (job.type === "registration" || job.type === "shop_purchase") {
    const referrer = job.referralObligation
      ? job.referralObligation.referrer
      : !recordedOnly
        ? (await playerRepository.findByWallet(job.walletAddress))?.referredBy
        : undefined;
    if (referrer) participants.push(referrer);
  }
  const keys = await gameplayDependencies(participants);
  if (
    keys.length &&
    job.type === "market_purchase" &&
    job.financialWorkflowVersion === 1 &&
    job.itemId
  ) {
    const reservation = (await findEquipmentById(job.itemId))
      ?.purchaseReservation;
    if (
      reservation?.key === job.signature &&
      reservation.buyer === job.walletAddress &&
      reservation.currency === "HIVE" &&
      reservation.price === job.price &&
      (!job.marketSettlement ||
        (reservation.seller === job.marketSettlement.seller &&
          reservation.price === job.marketSettlement.price &&
          reservation.fee === job.marketSettlement.fee &&
          reservation.proceeds === job.marketSettlement.proceeds))
    )
      return false;
  }
  if (keys.length || job.dependencyKeys?.length)
    await setPaymentDependencies(job.signature, keys);
  return keys.length > 0;
}

export function gameOrder(event: CustomJsonEvent) {
  return [event.blockNumber, event.transactionIndex, event.operationIndex];
}
function earlier(left: CustomJsonEvent, right: CustomJsonEvent) {
  const a = gameOrder(left),
    b = gameOrder(right);
  for (let index = 0; index < a.length; index++) {
    if (!Number.isSafeInteger(a[index]) || !Number.isSafeInteger(b[index]))
      throw new Error("Invalid dependency order");
    if (a[index] !== b[index]) return a[index] < b[index];
  }
  return false;
}
export async function gameParticipants(
  event: CustomJsonEvent,
): Promise<string[]> {
  const payload = validateGameActionSubmission(event);
  const participants = [event.account!];
  if (
    payload.action === "raid" ||
    payload.action === "help" ||
    payload.action === "sabotage"
  )
    participants.push(payload.metadata.target);
  if (
    payload.action === "purchase_chest" ||
    payload.action === "purchase_consumable"
  ) {
    const player = await playerRepository.findByWallet(event.account!);
    if (player?.referredBy && player.referredBy !== event.account)
      participants.push(player.referredBy);
  }
  return [...new Set(participants)].sort();
}

/** Saved earlier submissions are barriers, including held followers, not just raids. */
export async function gameplayDependencies(
  participants: string[],
  current?: CustomJsonEvent,
): Promise<string[]> {
  for await (const rows of readQueuedGameBatches(participants))
    for (const job of rows) {
      if (current && job.signature === gameEventKey(current)) continue;
      const record = job.gameEvent;
      if (!record?.event)
        throw new Error("Cannot isolate gameplay without saved event");
      if (
        gameEventKey(record.event) !== job.signature ||
        record.actor !== record.event.account ||
        ![
          record.blockNumber,
          record.transactionIndex,
          record.operationIndex,
        ].every(Number.isSafeInteger) ||
        record.blockNumber !== record.event.blockNumber ||
        record.transactionIndex !== record.event.transactionIndex ||
        record.operationIndex !== record.event.operationIndex
      )
        throw new Error("Cannot isolate inconsistent gameplay identity");
      if (current && !earlier(record.event, current)) continue;
      let wallets: string[];
      try {
        wallets = await gameParticipants(record.event);
      } catch (cause) {
        // Invalid payloads with no attempted effects are ordinary rejections.
        if (!job.databaseEffectsStarted && job.status !== "reconciliation")
          continue;
        throw new Error("Cannot isolate interrupted gameplay participants", {
          cause,
        });
      }
      if (record.participants)
        wallets = [...new Set([...wallets, ...record.participants])];
      if (wallets.some((wallet) => participants.includes(wallet)))
        return [job.signature];
    }
  return [];
}
