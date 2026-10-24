import { apiOk, apiError } from "@/lib/api/error-response";
import { getWallet } from "@/lib/api/get-wallet";
import { findPlayerByWallet } from "@/lib/modules/players/repository.server";

export async function GET(req: Request): Promise<Response> {
  const wallet = await getWallet(req);
  if (!wallet) {
    return apiError("Not authenticated", "UNAUTHORIZED", 401);
  }

  const player = await findPlayerByWallet(wallet);
  if (!player) {
    return apiError("Player not found", "PLAYER_NOT_FOUND", 404);
  }

  return apiOk({
    player: {
      wallet:   player.wallet,
      username: player.username ?? null,
      coins:    player.coins,
      stage:    player.stage,
    },
  });
}
