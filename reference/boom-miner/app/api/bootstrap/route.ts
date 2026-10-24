import { apiOk, apiError } from "@/lib/api/error-response";
import { getWallet } from "@/lib/api/get-wallet";
import { findPlayerByWallet } from "@/lib/modules/players/repository.server";
import { getHeroesByWallet } from "@/lib/modules/heroes/repository.server";
import { documentToRoster } from "@/features/game/serialize";

/** Read-only presentation seed. The game service owns run creation and recovery. */
export async function GET(req: Request): Promise<Response> {
  const wallet = await getWallet(req);
  if (!wallet) return apiError("Not authenticated", "UNAUTHORIZED", 401);
  const player = await findPlayerByWallet(wallet);
  if (!player) return apiError("Player not found. Register first.", "PLAYER_NOT_FOUND", 404);
  const heroes = await getHeroesByWallet(player.wallet);
  return apiOk({
    player: {
      wallet: player.wallet,
      username: player.username ?? null,
      coins: player.coins,
      stage: player.stage,
    },
    heroes: heroes.map(documentToRoster),
  });
}
