/** Idempotently initializes game checkpoints without resetting maps or balances. */
import mongoose from "mongoose";
import { connectDatabase } from "../lib/config/database";
import { PlayerModel } from "../lib/modules/players/model.server";
import {
  GameRepository,
  prepareGameDatabase,
} from "../server/game-websocket-engine/persistence/GameRepository";
import { WalletAuthority } from "../server/game-websocket-engine/authority/WalletAuthority";

await connectDatabase();
await prepareGameDatabase();
const repository = new GameRepository(),
  authority = new WalletAuthority();
let migrated = 0,
  busy = 0;
try {
  for await (const player of PlayerModel.find({}, { wallet: 1 }).lean().cursor()) {
    const lease = await authority.acquire(player.wallet);
    if (!lease) {
      busy++;
      continue;
    }
    try {
      await repository.load(player.wallet, lease);
      migrated++;
    } finally {
      await authority.release(player.wallet, lease.fencingToken);
    }
  }
  console.log(JSON.stringify({ migrated, busy }));
} finally {
  await mongoose.disconnect();
}
