import type { Document } from "mongoose";
import type { Rarity, SlotKey, StatRoll } from "@/features/types/game/types";

export interface IEquipmentMarket {
  currency: "HIVE";
  price: number;
  listedAt: number;
  isMarket: boolean;
}

export interface IEquipmentBase {
  purchaseReservation?: MarketReservation;
  templateId: number; // numeric template ID (1000–6999) — links into the const catalog (features/types/game/templates.ts), not a DB collection
  owner: string | null; // wallet address
  name: string;
  slot: SlotKey;
  rarity: Rarity;
  level: number;
  stats: StatRoll;
  equipped: boolean;
  salvaged: boolean;
  market?: IEquipmentMarket | null;
  createdAt: number;
  lastTransfer: number;
}

export interface MarketReservation {
  currency: "HIVE";
  key: string;
  buyer: string;
  seller: string;
  price: number;
  fee: number;
  proceeds: number;
  name: string;
  rarity: string;
  listedAt: number;
  state: "reserved" | "transferred" | "refunded";
}

export interface IEquipmentDocument extends IEquipmentBase, Document {}

export type EquipmentInput = IEquipmentBase;

export interface EquipmentMarketListing {
  currency: "HIVE";
  price: number;
  listedAt: number;
  isMarket: boolean;
}

export interface EquipmentRecord {
  purchaseReserved?: boolean;
  id: string;
  templateId: number;
  owner: string | null;
  name: string;
  slot: SlotKey;
  rarity: Rarity;
  level: number;
  stats: StatRoll;
  equipped: boolean;
  salvaged: boolean;
  market?: EquipmentMarketListing | null;
  createdAt: number;
  lastTransfer: number;
}

export type EquipmentInsertInput = Omit<EquipmentRecord, "id">;

export interface EquipmentRepository {
  listForSale(
    id: string,
    owner: string,
    price: number,
  ): Promise<{ ok: boolean; error?: string }>;
  cancelListing(
    id: string,
    owner: string,
  ): Promise<{ ok: boolean; error?: string }>;
  equip(
    id: string,
    owner: string,
  ): Promise<{ ok: boolean; item?: EquipmentRecord; error?: string }>;
  unequip(
    id: string,
    owner: string,
  ): Promise<{ ok: boolean; item?: EquipmentRecord; error?: string }>;
  salvage(
    id: string,
    owner: string,
  ): Promise<{ ok: boolean; item?: EquipmentRecord; error?: string }>;
  findById(id: string): Promise<EquipmentRecord | null>;
  findByIds(ids: string[]): Promise<EquipmentRecord[]>;
  insert(input: EquipmentInsertInput): Promise<EquipmentRecord>;
  /** Bumps level and rescales rolled stats. Fails (ok: false) if not found/owned. */
  upgrade(
    id: string,
    owner: string,
  ): Promise<{ ok: boolean; item?: EquipmentRecord; error?: string }>;
}
