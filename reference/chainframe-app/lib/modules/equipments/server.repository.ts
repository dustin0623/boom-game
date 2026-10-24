// Persistence for individual equipment only.
import { gameActionNow } from "@/lib/utils/game/execution-context.server";
import mongoose from "mongoose";
import { EquipmentModel } from "./server.model";
import type {
  IEquipmentDocument,
  EquipmentInput,
  MarketReservation,
  EquipmentRecord,
  EquipmentRepository,
} from "./server.types";
import { connectDatabase } from "@/lib/config/database";
import { upgradedStats } from "@/features/types/game/items";
import type { StatRoll } from "@/features/types/game/types";
import { hiveAmountSchema } from "@/lib/utils/game/pricing";

/**
 * Items are identified by their Mongo `_id` (no separate serial/edition
 * counter) — the game just mints items, it doesn't track a global item
 * number. An invalid id string is treated as "not found" rather than
 * letting Mongoose throw a CastError.
 */
function toObjectId(id: string): mongoose.Types.ObjectId | null {
  return mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
}

export async function reserveMarketPurchase(
  id: string,
  reservation: MarketReservation,
) {
  const _id = toObjectId(id);
  if (!_id) return null;
  if (reservation.currency !== "HIVE")
    throw new Error("Marketplace reservation requires HIVE");
  await connectDatabase();
  const existing = await findEquipmentById(id);
  if (existing?.purchaseReservation?.key === reservation.key) {
    const r = existing.purchaseReservation;
    if (
      r.buyer !== reservation.buyer ||
      r.seller !== reservation.seller ||
      r.price !== reservation.price ||
      r.currency !== reservation.currency
    )
      throw new Error("Marketplace reservation intent changed");
    return r;
  }
  const item = await EquipmentModel.findOneAndUpdate(
    {
      _id,
      owner: reservation.seller,
      "market.isMarket": true,
      "market.price": reservation.price,
      "market.currency": "HIVE",
      "market.listedAt": reservation.listedAt,
      equipped: false,
      salvaged: { $ne: true },
      purchaseReservation: { $exists: false },
    },
    { $set: { purchaseReservation: reservation } },
    { returnDocument: "after" },
  ).lean<IEquipmentDocument>();
  return item?.purchaseReservation ?? null;
}

export async function finishMarketPurchase(id: string, key: string) {
  const item = await findEquipmentById(id);
  const r = item?.purchaseReservation;
  if (!r || r.key !== key || r.state === "refunded")
    throw new Error("Missing marketplace reservation");
  if (r.state === "transferred") {
    if (item.owner !== r.buyer) throw new Error("Marketplace owner changed");
    return;
  }
  const result = await EquipmentModel.updateOne(
    {
      _id: toObjectId(id),
      owner: r.seller,
      "purchaseReservation.key": key,
      "purchaseReservation.state": "reserved",
    },
    {
      $set: {
        owner: r.buyer,
        equipped: false,
        market: null,
        lastTransfer: gameActionNow(),
        "purchaseReservation.state": "transferred",
      },
    },
  );
  if (!result.matchedCount) throw new Error("Marketplace reservation changed");
}

export async function releaseMarketPurchase(id: string, key: string) {
  await connectDatabase();
  await EquipmentModel.updateOne(
    {
      _id: toObjectId(id),
      "purchaseReservation.key": key,
      "purchaseReservation.state": "reserved",
    },
    { $set: { "purchaseReservation.state": "refunded" } },
  );
}

/** Call only after a durable terminal receipt. */
export async function clearMarketReservation(id: string, key: string) {
  await connectDatabase();
  await EquipmentModel.updateOne(
    {
      _id: toObjectId(id),
      "purchaseReservation.key": key,
      "purchaseReservation.state": { $in: ["transferred", "refunded"] },
    },
    { $unset: { purchaseReservation: 1 } },
  );
}

export async function findEquipmentById(
  id: string,
): Promise<IEquipmentDocument | null> {
  const _id = toObjectId(id);
  if (!_id) return null;
  await connectDatabase();
  return EquipmentModel.findOne({ _id }).lean<IEquipmentDocument>();
}

export async function findEquipmentsByOwner(
  owner: string,
): Promise<IEquipmentDocument[]> {
  await connectDatabase();
  return EquipmentModel.find({ owner, salvaged: { $ne: true } }).lean<
    IEquipmentDocument[]
  >();
}

export async function insertEquipment(
  input: EquipmentInput,
): Promise<IEquipmentDocument> {
  await connectDatabase();
  return EquipmentModel.create(input);
}

/** Guard the final write too: a reservation can win after the initial read. */
async function saveAvailableItem(item: IEquipmentDocument, owner: string) {
  const result = await EquipmentModel.findOneAndUpdate(
    {
      _id: item._id,
      owner,
      purchaseReservation: { $exists: false },
      level: item.level - (item.isModified("level") ? 1 : 0),
      salvaged: { $ne: true },
      "market.isMarket": { $ne: true },
    },
    {
      $set: {
        owner: item.owner,
        equipped: item.equipped,
        salvaged: item.salvaged,
        market: item.market,
        level: item.level,
        stats: item.stats,
        lastTransfer: item.lastTransfer,
      },
    },
    { returnDocument: "after" },
  ).lean<IEquipmentDocument>();
  return result
    ? { ok: true, item: result }
    : { ok: false, error: "Item became unavailable" };
}
export async function equipItem(
  id: string,
  owner: string,
): Promise<{ ok: boolean; item?: IEquipmentDocument; error?: string }> {
  const _id = toObjectId(id);
  if (!_id) return { ok: false, error: "Item not found or wrong owner" };
  await connectDatabase();
  const item = await EquipmentModel.findOne({
    _id,
    owner,
    purchaseReservation: { $exists: false },
  });
  if (!item) return { ok: false, error: "Item not found or wrong owner" };
  if (item.salvaged) return { ok: false, error: "Item is salvaged" };

  // Unequip any other item in the same slot first.
  if (item.market?.isMarket) return { ok: false, error: "Item is listed" };
  await EquipmentModel.updateMany(
    {
      owner,
      slot: item.slot,
      equipped: true,
      purchaseReservation: { $exists: false },
    },
    { $set: { equipped: false } },
  );

  item.equipped = true;
  return saveAvailableItem(item, owner);
}

export async function unequipItem(
  id: string,
  owner: string,
): Promise<{ ok: boolean; item?: IEquipmentDocument; error?: string }> {
  const _id = toObjectId(id);
  if (!_id) return { ok: false, error: "Item not found or wrong owner" };
  await connectDatabase();
  const item = await EquipmentModel.findOne({
    _id,
    owner,
    purchaseReservation: { $exists: false },
  });
  if (!item) return { ok: false, error: "Item not found or wrong owner" };
  if (item.salvaged) return { ok: false, error: "Item is salvaged" };
  item.equipped = false;
  return saveAvailableItem(item, owner);
}

export async function salvageItem(
  id: string,
  owner: string,
): Promise<{ ok: boolean; item?: IEquipmentDocument; error?: string }> {
  const _id = toObjectId(id);
  if (!_id) return { ok: false, error: "Item not found or wrong owner" };
  await connectDatabase();
  const item = await EquipmentModel.findOne({
    _id,
    owner,
    purchaseReservation: { $exists: false },
  });
  if (!item) return { ok: false, error: "Item not found or wrong owner" };
  if (item.equipped) return { ok: false, error: "Item is equipped" };
  if (item.market?.isMarket) return { ok: false, error: "Item is listed" };
  if (item.salvaged) return { ok: false, error: "Already salvaged" };
  item.salvaged = true;
  item.equipped = false;
  item.market = null;
  item.owner = null;
  return saveAvailableItem(item, owner);
}

export async function upgradeItem(
  id: string,
  owner: string,
): Promise<{ ok: boolean; item?: IEquipmentDocument; error?: string }> {
  const _id = toObjectId(id);
  if (!_id) return { ok: false, error: "Item not found or wrong owner" };
  await connectDatabase();
  const item = await EquipmentModel.findOne({
    _id,
    owner,
    purchaseReservation: { $exists: false },
  });
  if (!item) return { ok: false, error: "Item not found or wrong owner" };
  if (item.salvaged || item.market?.isMarket)
    return { ok: false, error: "Item is unavailable" };
  // Every level must also scale the rolled stats (reference forge: x1.05
  // per level). Bumping `level` alone left the item's actual power
  // completely unchanged — the SPARKS cost was real, the upgrade was not.
  item.stats = upgradedStats(
    item.stats as StatRoll,
  ) as IEquipmentDocument["stats"];
  item.level += 1;
  return saveAvailableItem(item, owner);
}

/**
 * Lists an item on the market. Rejects equipped or salvaged items.
 */
export async function listItemForSale(
  id: string,
  owner: string,
  price: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!hiveAmountSchema.safeParse(price).success)
    return { ok: false, error: "Invalid marketplace HIVE price" };
  const _id = toObjectId(id);
  if (!_id)
    return { ok: false, error: "Item not found, is equipped, or is salvaged" };
  await connectDatabase();
  const now = gameActionNow();
  const result = await EquipmentModel.updateOne(
    {
      _id,
      owner,
      equipped: false,
      salvaged: { $ne: true },
      purchaseReservation: { $exists: false },
    },
    {
      $set: {
        market: { price, currency: "HIVE", listedAt: now, isMarket: true },
      },
    },
  );
  if (result.matchedCount === 0)
    return { ok: false, error: "Item not found, is equipped, or is salvaged" };
  return { ok: true };
}

/**
 * Cancels an active item listing.
 */
export async function cancelItemListing(
  id: string,
  owner: string,
): Promise<{ ok: boolean; error?: string }> {
  const _id = toObjectId(id);
  if (!_id) return { ok: false, error: "Listing not found" };
  await connectDatabase();
  const result = await EquipmentModel.updateOne(
    {
      _id,
      owner,
      "market.isMarket": true,
      purchaseReservation: { $exists: false },
    },
    { $set: { market: null } },
  );
  if (result.matchedCount === 0)
    return { ok: false, error: "Listing not found" };
  return { ok: true };
}

/**
 * Returns all items currently listed on the market.
 */
export async function findListedEquipments(): Promise<IEquipmentDocument[]> {
  await connectDatabase();
  return EquipmentModel.find({
    "market.isMarket": true,
    "market.currency": "HIVE",
    salvaged: { $ne: true },
    purchaseReservation: { $exists: false },
  })
    .sort({ "market.listedAt": -1 })
    .lean<IEquipmentDocument[]>();
}

function toEquipmentRecord(doc: IEquipmentDocument): EquipmentRecord {
  return {
    id: String((doc as unknown as { _id: unknown })._id),
    purchaseReserved: Boolean(doc.purchaseReservation),
    templateId: doc.templateId,
    owner: doc.owner,
    name: doc.name,
    slot: doc.slot,
    rarity: doc.rarity,
    level: doc.level,
    stats: { ...doc.stats },
    equipped: doc.equipped,
    salvaged: doc.salvaged,
    market: doc.market ?? null,
    createdAt: doc.createdAt,
    lastTransfer: doc.lastTransfer,
  };
}

export async function findEquipmentsByIds(ids: string[]): Promise<EquipmentRecord[]> {
  if (!ids.length) return [];
  const unique = [...new Set(ids)];
  const objectIds = unique.map(toObjectId);
  if (objectIds.some((id) => !id)) throw new Error("Invalid equipped item reference");
  await connectDatabase();
  const rows = await EquipmentModel.find({ _id: { $in: objectIds } }).lean<IEquipmentDocument[]>();
  return rows.map(toEquipmentRecord);
}

export const equipmentRepository: EquipmentRepository = {
  findByIds: findEquipmentsByIds,
  listForSale: listItemForSale,
  cancelListing: cancelItemListing,
  async equip(id, owner) {
    const result = await equipItem(id, owner);
    return {
      ...result,
      item: result.item ? toEquipmentRecord(result.item) : undefined,
    };
  },
  async unequip(id, owner) {
    const result = await unequipItem(id, owner);
    return {
      ...result,
      item: result.item ? toEquipmentRecord(result.item) : undefined,
    };
  },
  async salvage(id, owner) {
    const result = await salvageItem(id, owner);
    return {
      ...result,
      item: result.item ? toEquipmentRecord(result.item) : undefined,
    };
  },
  async findById(id) {
    const item = await findEquipmentById(id);
    return item ? toEquipmentRecord(item) : null;
  },

  async insert(input) {
    const item = await insertEquipment(input);
    return toEquipmentRecord(item);
  },

  async upgrade(id, owner) {
    const result = await upgradeItem(id, owner);
    return {
      ok: result.ok,
      item: result.item ? toEquipmentRecord(result.item) : undefined,
      error: result.error,
    };
  },
};
