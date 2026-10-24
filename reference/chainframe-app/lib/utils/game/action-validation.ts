import type { CustomJsonEvent } from "hivexph-sdk";
import { z } from "zod";
import { readGameJson } from "@/lib/utils/hive/operation";
import { GAME_ACTION_CUSTOM_JSON_ID } from "@/lib/chains/modules/hive/client";
import {
  gameActionAuthority,
  parseGameActionPayload,
  type GameActionPayload,
} from "./action-protocol";

/** Pure protocol rejection; the server boundary translates it to a receipt error. */
export class GameActionValidationError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "GameActionValidationError";
  }
}

/** Browser-safe checks on a signed submission, without replay or settlement effects. */
export function validateGameActionSubmission(
  event: CustomJsonEvent,
): GameActionPayload {
  if (event.id !== GAME_ACTION_CUSTOM_JSON_ID)
    throw new GameActionValidationError("unexpected custom JSON id");
  let payload: GameActionPayload;
  try {
    payload = parseGameActionPayload(readGameJson(event.raw));
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    throw new GameActionValidationError(
      "missing or invalid original custom JSON",
    );
  }
  const authority = gameActionAuthority(payload.action);
  const signers =
    authority === "active" ? event.requiredAuths : event.requiredPostingAuths;
  const other =
    authority === "active" ? event.requiredPostingAuths : event.requiredAuths;
  if (signers.length !== 1 || other.length || signers[0] !== event.account)
    throw new GameActionValidationError(
      `game actions require exactly one matching ${authority} authority`,
    );
  return payload;
}
