/** Browser-safe shapes exchanged between the play screen and the game server functions. */
export interface SessionHero {
  id: string;
  name: string;
  type: string;
  rarity: string;
  power: number;
  speed: number;
  stamina: number;
  bombNumber: number;
  bombRange: number;
  maxEnergy: number;
}

export interface PlayerSession {
  playerId: string;
  coins: number;
  stage: number;
  seed: number;
  destroyedNodes: string[];
  heroes: SessionHero[];
}

export interface SyncResult {
  ok: boolean;
  coins: number;
  stage: number;
  seed: number;
  destroyedNodes: string[];
  accepted: number;
  rejected: number;
}
