import { randomUUID } from "node:crypto";
import { connectDatabase } from "@/lib/config/database";
import { PlayerModel } from "./model.server";

const MUTATION_LOCK_MS = 30_000;

function walletFilter(wallet: string) {
  const escaped = wallet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { $regex: new RegExp(`^${escaped}$`, "i") };
}

export async function acquirePlayerMutation(wallet: string): Promise<string | null> {
  await connectDatabase();
  const now = new Date();
  const lockId = randomUUID();
  const player = await PlayerModel.findOneAndUpdate(
    {
      wallet: walletFilter(wallet),
      $and: [
        {
          $or: [
            { "game.lease.expiresAt": { $exists: false } },
            { "game.lease.expiresAt": { $lte: now } },
          ],
        },
        {
          $or: [
            { "game.mutationLock.expiresAt": { $exists: false } },
            { "game.mutationLock.expiresAt": { $lte: now } },
          ],
        },
      ],
    },
    {
      $set: {
        "game.mutationLock": {
          id: lockId,
          expiresAt: new Date(now.getTime() + MUTATION_LOCK_MS),
        },
      },
    },
    { returnDocument: "after" },
  )
    .select({ _id: 1 })
    .lean();
  return player ? lockId : null;
}

export async function releasePlayerMutation(wallet: string, lockId: string): Promise<void> {
  await connectDatabase();
  const result = await PlayerModel.updateOne(
    { wallet: walletFilter(wallet), "game.mutationLock.id": lockId },
    { $unset: { "game.mutationLock": 1 } },
  );
  if (result.matchedCount !== 1) throw new Error("PLAYER_MUTATION_LOCK_LOST");
}
