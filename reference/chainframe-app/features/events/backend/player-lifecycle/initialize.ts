import { withDatabaseOperation } from "@/lib/utils/database/operation.server";
import {
  findPlayerByWallet,
  findPlayerByUsername,
  upsertPlayer,
  incrementPlayer,
  initializePlayerProfile,
  assignPlayerReferrer,
} from "@/lib/modules/players/server.repository";
import { incrementStat } from "@/lib/modules/game-stats/server.repository";
import { hasRegistrationJob } from "@/lib/modules/transactions-pending/server.repository";
import { hasRegistrationReceipt } from "@/lib/modules/transactions-processed/server.repository";
import { normalizeHiveUsername } from "@/lib/utils/hive/validation";
export async function initializePlayerProfileForWallet(
  wallet: string,
  refUsername: string | null,
) {
  return withDatabaseOperation(async () => {
    // Recheck inside the ordered operation: another request may have initialized
    // this profile since the initial read.
    let player = await findPlayerByWallet(wallet);
    if (!player) {
      await upsertPlayer({
        wallet,
        username: wallet,
        profileInitialized: false,
      });
      player = await findPlayerByWallet(wallet);
    }
    if (!player) return null;
    if (
      player.profileInitialized === false &&
      (await initializePlayerProfile(wallet))
    ) {
      await incrementStat("registeredPlayers");
    }
    if (
      refUsername &&
      !player.isRegistered &&
      !player.referredBy &&
      !player.registrationTxId
    ) {
      let normalized: string;
      try {
        normalized = normalizeHiveUsername(refUsername);
      } catch {
        return player;
      }
      const referrer = await findPlayerByUsername(normalized);
      if (
        referrer &&
        referrer.wallet !== wallet &&
        !(await hasRegistrationJob(wallet)) &&
        !(await hasRegistrationReceipt(wallet))
      ) {
        if (await assignPlayerReferrer(wallet, referrer.wallet))
          await incrementPlayer(referrer.wallet, { referralCount: 1 });
        // A competing request may have attached a different referrer or registered the player.
        player = await findPlayerByWallet(wallet);
      }
    }
    return player;
  });
}
