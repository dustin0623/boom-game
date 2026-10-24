import type { CustomJsonEvent } from "hivexph-sdk";
import type { GameActionPayload } from "@/lib/utils/game/action-protocol";
import {
  validateGameActionSubmission,
  GameActionValidationError,
} from "@/lib/utils/game/action-validation";
/** Server processing rejection, shared by validation and domain dispatch. */
export class GameActionRejectedError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "GameActionRejectedError";
  }
}

/** Protocol stage is separate so the processor can check nonce reuse before timestamp validity. */
export function validateGameActionProtocol(
  event: CustomJsonEvent,
): GameActionPayload {
  try {
    return validateGameActionSubmission(event);
  } catch (error) {
    if (error instanceof GameActionValidationError)
      throw new GameActionRejectedError(error.reason);
    throw error;
  }
}

export function normalizeBlockchainTimestamp(blockTimestamp: string): number {
  const timestamp = Date.parse(
    blockTimestamp.endsWith("Z") ? blockTimestamp : blockTimestamp + "Z",
  );
  if (!Number.isFinite(timestamp))
    throw new GameActionRejectedError("invalid blockchain timestamp");
  return timestamp;
}
