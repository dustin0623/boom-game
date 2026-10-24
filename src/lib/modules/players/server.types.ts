import type { PlayerDocument } from "./server.model";

export type CreatePlayerInput = {
  username: string;
  displayName?: string;
  walletAddress: string | null;
  email: string | null;
  passwordHash: string | null;
};

export interface PlayerRepository {
  findById(id: string): Promise<PlayerDocument | null>;
  findByEmail(email: string): Promise<PlayerDocument | null>;
  findByWallet(address: string): Promise<PlayerDocument | null>;
  findByUsername(username: string): Promise<PlayerDocument | null>;
  create(data: CreatePlayerInput): Promise<PlayerDocument>;
  /** Attach email + password to an existing (e.g. wallet-registered) account. */
  linkEmailAndPassword(id: string, email: string, passwordHash: string): Promise<PlayerDocument>;
  touchLogin(id: string): Promise<PlayerDocument>;
}
