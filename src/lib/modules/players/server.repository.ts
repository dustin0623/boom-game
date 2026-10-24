import { mockDb } from "@/features/stores/mock/database";
import { PlayerDocumentSchema, type PlayerDocument } from "./server.model";
import type { PlayerRepository } from "./server.types";

const all = () => [...mockDb.players.values()];

function update(id: string, patch: Partial<PlayerDocument>) {
  const current = mockDb.players.get(id);
  if (!current) throw new Error("Player not found");
  const next = PlayerDocumentSchema.parse({ ...current, ...patch, updatedAt: new Date().toISOString() });
  mockDb.players.set(id, next);
  return next;
}

/** Players repository (mock store until MongoDB is wired). */
export const playerRepository: PlayerRepository = {
  async findById(id) {
    return mockDb.players.get(id) ?? null;
  },
  async findByEmail(email) {
    const e = email.toLowerCase();
    return all().find((p) => p.email === e) ?? null;
  },
  async findByWallet(address) {
    return all().find((p) => p.walletAddress === address) ?? null;
  },
  async findByUsername(username) {
    const u = username.toLowerCase();
    return all().find((p) => p.username.toLowerCase() === u) ?? null;
  },
  async create(data) {
    const now = new Date().toISOString();
    const record = PlayerDocumentSchema.parse({
      ...data,
      displayName: data.displayName ?? data.username,
      email: data.email?.toLowerCase() ?? null,
      id: crypto.randomUUID(),
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    });
    mockDb.players.set(record.id, record);
    return record;
  },
  async linkEmailAndPassword(id, email, passwordHash) {
    const e = email.toLowerCase();
    const owner = await this.findByEmail(e);
    if (owner && owner.id !== id) throw new Error("Email already registered");
    return update(id, { email: e, passwordHash, isEmailVerified: false });
  },
  async touchLogin(id) {
    return update(id, { lastLoginAt: new Date().toISOString() });
  },
};

/** Strip private fields before returning to clients. */
export function toPlayer({ passwordHash: _p, ...player }: PlayerDocument) {
  return player;
}

/** Derive a unique username (3–32 chars) from a seed. */
export async function uniqueUsername(seed: string) {
  const base = (seed.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24) || "player").padEnd(3, "0");
  let name = base;
  while (await playerRepository.findByUsername(name)) name = `${base}${Math.floor(Math.random() * 1e6)}`;
  return name;
}
