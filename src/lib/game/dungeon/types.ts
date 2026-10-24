/** Framework-independent authoritative gameplay data. Coordinates are in tiles. */
export interface Point {
  x: number;
  y: number;
}
export interface GameNode extends Point {
  kind: "chest" | "bush";
  rarity?: string;
  hp: number;
  maxHp: number;
  coins: number;
  destroyed: boolean;
}
export interface GameHero extends Point {
  id: string;
  name: string;
  mintedNumber: number;
  owner: string;
  level: number;
  type: string;
  rarity: string;
  power: number;
  speed: number;
  stamina: number;
  bombNumber: number;
  bombRange: number;
  energy: number;
  maxEnergy: number;
  onMap: boolean;
  recoveryAt: number;
  market: { listed: boolean; price: number; seller: string | null; created: number; sold: number };
  phase: "searching" | "moving" | "escaping";
  path: Point[];
  target: string | null;
}
export interface GameBomb extends Point {
  id: string;
  heroId: string;
  range: number;
  power: number;
  dueAt: number;
}
export interface GameState {
  playerId: string;
  runId: string;
  mapId: string;
  stage: number;
  seed: number;
  revision: number;
  time: number;
  random: number;
  bombSerial: number;
  paused: boolean;
  nodes: Record<string, GameNode>;
  heroes: Record<string, GameHero>;
  bombs: Record<string, GameBomb>;
  coins: number;
  daily: { date: string; used: number; cap: number };
}
export type GameEffect =
  | { type: "explosion"; id: string; tiles: Point[] }
  | { type: "reward"; id: string; nodeKey: string; amount: number }
  | { type: "stage"; id: string; stage: number };
export interface RewardReceipt {
  id: string;
  nodeKey: string;
  amount: number;
}
export interface SimulationResult {
  state: GameState;
  effects: GameEffect[];
  rewards: RewardReceipt[];
  resolvedBombs: string[];
  durable: boolean;
}
export type GameCommand =
  | { type: "deploy"; heroId: string }
  | { type: "recall"; heroId: string }
  | { type: "pause"; paused: boolean };
