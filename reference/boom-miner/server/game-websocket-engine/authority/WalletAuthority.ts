import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { connectDatabase } from "@/lib/config/database";
import { PlayerModel } from "@/lib/modules/players/model.server";
import { SERVICE_CONFIG } from "../config";

export interface LeaseGrant {
  wallet: string;
  instanceId: string;
  fencingToken: number;
  expiresAt: Date;
}

export class WalletAuthority {
  readonly instanceId = `${process.env.VERCEL_REGION ?? "local"}:${hostname()}:${process.pid}:${randomUUID()}`;

  constructor(private readonly leaseMs: number = SERVICE_CONFIG.leaseMs) {}

  async acquire(wallet: string): Promise<LeaseGrant | null> {
    await connectDatabase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.leaseMs);
    const player = await PlayerModel.findOneAndUpdate(
      {
        wallet,
        $and: [
          {
            $or: [
              { "game.lease.instanceId": this.instanceId },
              { "game.lease.expiresAt": { $lte: now } },
              { "game.lease": { $exists: false } },
              { "game.lease.expiresAt": { $exists: false } },
            ],
          },
          {
            $or: [
              { "game.mutationLock.expiresAt": { $lte: now } },
              { "game.mutationLock.expiresAt": { $exists: false } },
            ],
          },
        ],
      },
      [
        {
          $set: {
            "game.lease": {
              instanceId: this.instanceId,
              fencingToken: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$game.lease.instanceId", this.instanceId] },
                      { $gt: ["$game.lease.expiresAt", now] },
                    ],
                  },
                  { $ifNull: ["$game.lease.fencingToken", 1] },
                  { $add: [{ $ifNull: ["$game.lease.fencingToken", 0] }, 1] },
                ],
              },
              expiresAt,
            },
          },
        },
      ],
      { returnDocument: "after", updatePipeline: true },
    ).lean<{ game?: { lease?: Omit<LeaseGrant, "wallet"> } } | null>();
    return player?.game?.lease ? { wallet, ...player.game.lease } : null;
  }

  async renew(grant: LeaseGrant): Promise<LeaseGrant | null> {
    await connectDatabase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.leaseMs);
    const player = await PlayerModel.findOneAndUpdate(
      {
        wallet: grant.wallet,
        "game.lease.instanceId": grant.instanceId,
        "game.lease.fencingToken": grant.fencingToken,
        "game.lease.expiresAt": { $gt: now },
      },
      { $set: { "game.lease.expiresAt": expiresAt } },
      { returnDocument: "after" },
    ).lean<{ game?: { lease?: Omit<LeaseGrant, "wallet"> } } | null>();
    return player?.game?.lease ? { wallet: grant.wallet, ...player.game.lease } : null;
  }

  async assertCurrent(grant: LeaseGrant): Promise<boolean> {
    await connectDatabase();
    const lease = await PlayerModel.findOne({
      wallet: grant.wallet,
      "game.lease.instanceId": grant.instanceId,
      "game.lease.fencingToken": grant.fencingToken,
      "game.lease.expiresAt": { $gt: new Date() },
    })
      .select({ _id: 1 })
      .lean();
    return Boolean(lease);
  }

  async release(wallet: string, fencingToken: number): Promise<void> {
    await connectDatabase();
    await PlayerModel.updateOne(
      {
        wallet,
        "game.lease.instanceId": this.instanceId,
        "game.lease.fencingToken": fencingToken,
      },
      { $set: { "game.lease.expiresAt": new Date(0) } },
    );
  }
}
