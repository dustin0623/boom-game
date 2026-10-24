import { z } from "zod";
import { PlayerSchema } from "@/features/types/auth.types";

/** MongoDB collection name for players. */
export const PLAYERS_COLLECTION = "players";

/**
 * Stored player document: identity + credentials only.
 * Either walletAddress or email identifies the account; both can be linked.
 */
export const PlayerDocumentSchema = PlayerSchema.extend({
  /** PBKDF2 hash; null until email + password are linked. */
  passwordHash: z.string().nullable(),
});
export type PlayerDocument = z.infer<typeof PlayerDocumentSchema>;
