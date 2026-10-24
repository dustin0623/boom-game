import { playerRepository } from "@/lib/modules/players/server.repository";
import { equipmentRepository } from "@/lib/modules/equipments/server.repository";
import { logRepository } from "@/lib/modules/logs/server.repository";
import type { CustomJsonEvent } from "hivexph-sdk";
import { SOCIAL_ECONOMY } from "@/lib/config/constants/economy";
import {
  gameActionNow,
  gameActionSeed,
} from "@/lib/utils/game/execution-context.server";
import { settleTick } from "@/features/events/backend/tick-player/action";
import { claimVault } from "@/features/events/backend/claim-vault/action";
import { stakeVault } from "@/features/events/backend/stake-vault/action";
import { upgradeEquipment } from "@/features/events/backend/equipment/upgrade";
import { upgradeStat } from "@/features/events/backend/upgrade-stat/action";
import { helpTarget } from "@/features/events/backend/social-actions/help";
import { sabotageTarget } from "@/features/events/backend/social-actions/sabotage";
import { equipItem } from "@/features/events/backend/equipment/equip";
import { raidTarget } from "@/features/events/backend/raid/action";
import { salvageItem } from "@/features/events/backend/equipment/salvage";
import { unequipItem } from "@/features/events/backend/equipment/unequip";
import { openChest } from "@/features/events/backend/equipment/chest";
import {
  purchaseConsumable,
  purchaseChest,
} from "@/features/events/backend/purchase-item/action";
import { equipCosmetic } from "@/features/events/backend/equip-cosmetic/action";
import { changeMarketListing } from "@/features/events/backend/market-listing/action";
import { requestWithdrawal } from "@/features/events/backend/request-withdrawal/action";
import { gameEventKey } from "@/lib/utils/game/event-identity.server";

import { createSeededRng } from "@/lib/utils/game/rng.server";

import {
  GAME_ACTION_NAMES,
  type GameActionPayload,
} from "@/lib/utils/game/action-protocol";
import type { GameActionRegistry } from "@/server/game-smart-contract/features/types/processing";
import { GameActionRejectedError } from "@/server/game-smart-contract/features/events/process-game-action/validation";

function checked<T extends { ok: boolean; error?: unknown }>(result: T): T {
  if (!result.ok)
    throw new GameActionRejectedError(
      typeof result.error === "string"
        ? result.error
        : "Action rejected by game rules",
    );
  return result;
}

async function execute(payload: GameActionPayload, event: CustomJsonEvent) {
  const actor = event.account!;
  const player = await playerRepository.findByWallet(actor);
  if (!player?.isRegistered)
    throw new GameActionRejectedError("Player registration is required");
  if (payload.action === "help" || payload.action === "sabotage") {
    const limits = SOCIAL_ECONOMY.socialActionLimits;
    if (
      (await logRepository.countSocialActionsSince(
        actor,
        gameActionNow() - limits.windowMs,
      )) >= limits.maxActionsPerWindow
    )
      throw new GameActionRejectedError(
        "Too many social actions; wait before trying again",
      );
  }
  if (
    [
      "increase_vault",
      "upgrade_stat",
      "upgrade_equipment",
      "equip",
      "unequip",
      "salvage_equipment",
      "open_chest",
      "purchase_consumable",
      "purchase_chest",
    ].includes(payload.action)
  )
    await settleTick(actor);
  switch (payload.action) {
    case "claim": {
      const result = checked(await claimVault(actor));
      return { ...result, amount: result.claimed };
    }
    case "increase_vault":
      return checked(
        await stakeVault(actor, { amount: payload.metadata.amount }),
      );
    case "upgrade_stat":
      return checked(
        await upgradeStat(
          actor,
          payload.metadata.stat,
          payload.metadata.levels,
        ),
      );
    case "upgrade_equipment":
      checked(
        await upgradeEquipment(
          actor,
          payload.metadata.equipmentId,
          payload.metadata.levels,
        ),
      );
      return { ok: true };
    case "raid": {
      const result = await raidTarget(
        actor,
        payload.metadata.target,
        event.transactionId + ":" + event.operationIndex,
      );
      if (result.status >= 400)
        checked({ ok: false, error: result.body.error });
      return result.body;
    }
    case "help":
      return checked(
        await helpTarget(
          actor,
          payload.metadata.target,
          payload.metadata.consumableId,
          payload.metadata.stat,
          createSeededRng(gameActionSeed()!),
        ),
      );
    case "sabotage":
      return checked(
        await sabotageTarget(
          actor,
          payload.metadata.target,
          payload.metadata.consumableId,
          payload.metadata.stat,
          createSeededRng(gameActionSeed()!),
        ),
      );
    case "equip":
    case "unequip": {
      const item = await equipmentRepository.findById(
        payload.metadata.equipmentId,
      );
      if (!item || item.slot !== payload.metadata.slot)
        throw new GameActionRejectedError(
          "Equipment slot does not match the item",
        );
      return checked(
        await (payload.action === "equip" ? equipItem : unequipItem)(
          actor,
          payload.metadata.equipmentId,
        ),
      );
    }
    case "salvage_equipment":
      return checked(await salvageItem(actor, payload.metadata.equipmentId));
    case "open_chest":
      return checked(
        await openChest(actor, payload.metadata.itemId, gameActionSeed()!),
      );
    case "purchase_chest":
      return checked(
        await purchaseChest(
          actor,
          payload.metadata.itemId,
          payload.metadata.quantity,
          payload.metadata.expectedUnitPrice,
        ),
      );
    case "purchase_consumable":
      return checked(
        await purchaseConsumable(
          actor,
          payload.metadata.itemId,
          payload.metadata.quantity,
          payload.metadata.expectedUnitPrice,
        ),
      );
    case "market_list":
      return checked(
        await changeMarketListing(
          actor,
          payload.metadata.itemId,
          payload.metadata.price,
          payload.metadata.currency,
        ),
      );
    case "market_cancel":
      return checked(await changeMarketListing(actor, payload.metadata.itemId));
    case "equip_cosmetic":
      return checked(
        await equipCosmetic(
          actor,
          payload.metadata.kind,
          payload.metadata.templateId,
        ),
      );
    case "request_withdrawal":
      return checked(
        await requestWithdrawal(
          actor,
          payload.metadata.amount,
          `withdrawal:${gameEventKey(event)}`,
        ),
      );
  }
}
export function createGameActionRegistry(): GameActionRegistry {
  return Object.fromEntries(
    GAME_ACTION_NAMES.map((name) => [name, execute]),
  ) as GameActionRegistry;
}
