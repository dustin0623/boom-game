import type { CustomJsonEvent } from "hivexph-sdk";
import type {
  GameActionName,
  GameActionPayload,
} from "@/lib/utils/game/action-protocol";
export type GameActionHandler = (
  action: GameActionPayload,
  event: CustomJsonEvent,
) => Promise<unknown> | unknown;

export type GameActionRegistry = Readonly<
  Partial<Record<GameActionName, GameActionHandler>>
>;

export type GameActionProcessingResult =
  | { status: "deferred" | "quarantined"; eventId: string; reason: string }
  | { status: "executed"; eventId: string; action: GameActionName }
  | { status: "rejected"; eventId: string; reason: string };
