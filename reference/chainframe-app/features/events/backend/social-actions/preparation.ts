import { inventoryItemRepository } from "@/lib/modules/items/server.repository";
import { playerRepository } from "@/lib/modules/players/server.repository";
import {
  CONSUMABLES,
  STAT_EFFECT_TARGETS,
  type ConsumableKind,
  type SocialActionInput,
} from "@/features/types/game/consumables";
import {
  acquireSocialLock,
  allowSocialAction,
} from "@/lib/utils/game/action-guards.server";

export type SocialPreparationErrorCode =
  | "duplicate_request"
  | "rate_limited"
  | "invalid_stat"
  | "caller_not_found"
  | "target_not_found"
  | "self_target"
  | "wrong_item_kind"
  | "no_item";
type SocialPreparationFailure = {
  ok: false;
  code: SocialPreparationErrorCode;
  error: string;
};
type Participant = NonNullable<
  Awaited<ReturnType<typeof playerRepository.findByWallet>>
>;

/** Preserve eligibility order and hold the same lock through the action-specific writes. */
export async function withSocialPreparation<Result extends { ok: boolean }>(
  kind: ConsumableKind,
  input: SocialActionInput & { caller: string },
  execute: (players: {
    callerPlayer: Participant;
    targetPlayer: Participant;
  }) => Promise<Result>,
): Promise<Result | SocialPreparationFailure> {
  const { caller, target, itemId, stat } = input;
  const fail = (
    code: SocialPreparationErrorCode,
    error: string,
  ): SocialPreparationFailure => ({ ok: false, code, error });
  const release = acquireSocialLock(caller, target);
  if (!release)
    return fail(
      "duplicate_request",
      "A request for this target is already in progress",
    );
  try {
    if (!allowSocialAction(caller))
      return fail("rate_limited", "Too many attempts, slow down");
    if (!STAT_EFFECT_TARGETS.includes(stat))
      return fail("invalid_stat", "Unsupported stat");
    const callerPlayer = await playerRepository.findByWallet(caller);
    const targetPlayer = await playerRepository.findByWallet(target);
    if (!callerPlayer) return fail("caller_not_found", "Player not found");
    if (!targetPlayer) return fail("target_not_found", "Target not found");
    if (targetPlayer.wallet === callerPlayer.wallet)
      return fail("self_target", `Cannot ${kind} yourself`);
    if (CONSUMABLES[itemId].kind !== kind)
      return fail("wrong_item_kind", `Item cannot be used to ${kind}`);
    if ((await inventoryItemRepository.quantity(caller, itemId)) < 1)
      return fail("no_item", "You do not own this item");
    return await execute({ callerPlayer, targetPlayer });
  } finally {
    release();
  }
}
