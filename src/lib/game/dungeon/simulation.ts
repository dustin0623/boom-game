import { MAX_ON_MAP, canDeployEnergy, DAILY_CHEST_CAP_PER_HERO } from "@/lib/config/constants/game";
import { MAP_HEIGHT, MAP_WIDTH } from "@/game/data/TileTypes";
import { generateStageMap } from "./generate";
import { BOMB_FUSE_MS, materializeRecovery, movementSpeed, utcDate } from "./rules";
import type { GameBomb, GameCommand, GameHero, GameState, Point, SimulationResult } from "./types";

const DIRECTIONS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];
export const keyOf = (p: Point) => `${p.x},${p.y}`;
/** Movement candidates share immutable node data; damage replaces affected nodes. */
export function simulationCandidate(state: GameState): GameState {
  return {
    ...state,
    daily: { ...state.daily },
    bombs: { ...state.bombs },
    heroes: Object.fromEntries(
      Object.entries(state.heroes).map(([id, h]) => [id, { ...h, path: [...h.path] }]),
    ),
  };
}
export function isWall(x: number, y: number): boolean {
  return (
    x <= 0 || y <= 0 || x >= MAP_WIDTH - 1 || y >= MAP_HEIGHT - 1 || (x % 2 === 0 && y % 2 === 0)
  );
}
export function walkable(state: GameState, p: Point): boolean {
  return !isWall(p.x, p.y) && (!state.nodes[keyOf(p)] || state.nodes[keyOf(p)]!.destroyed);
}
function random(state: GameState): number {
  let t = (state.random = (state.random + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function blastTiles(state: GameState, bomb: Pick<GameBomb, "x" | "y" | "range">): Point[] {
  const tiles: Point[] = [{ x: bomb.x, y: bomb.y }];
  for (const d of DIRECTIONS) {
    for (let step = 1; step <= bomb.range; step++) {
      const p = { x: bomb.x + d.x * step, y: bomb.y + d.y * step };
      if (isWall(p.x, p.y)) break;
      tiles.push(p);
      const node = state.nodes[keyOf(p)];
      if (node && !node.destroyed) break;
    }
  }
  return tiles;
}
/** True when a hero standing on `from` after planting there can reach a safe tile quickly. */
function canEscape(state: GameState, from: Point, blast: Set<string>, danger: Set<string>): boolean {
  const queue: { p: Point; d: number }[] = [{ p: from, d: 0 }];
  const seen = new Set([keyOf(from)]);
  for (let i = 0; i < queue.length; i++) {
    const { p, d } = queue[i]!;
    const k = keyOf(p);
    if (!blast.has(k) && !danger.has(k)) return true;
    if (d >= 6) continue;
    for (const dir of DIRECTIONS) {
      const next = { x: p.x + dir.x, y: p.y + dir.y };
      const nk = keyOf(next);
      if (seen.has(nk) || !walkable(state, next)) continue;
      seen.add(nk);
      queue.push({ p: next, d: d + 1 });
    }
  }
  return false;
}
/**
 * BombCrypto-style targeting: BFS over reachable safe tiles, score each tile as a
 * bomb spot by what its blast (using the hero's range) would hit — chests and
 * high-HP blocks first, multi-block spots preferred, blocks claimed by other
 * heroes discounted — divided by walking distance. Spots without an escape route
 * are skipped.
 */
function search(
  state: GameState,
  hero: GameHero,
  danger: Set<string>,
  reserved: Set<string>,
): { path: Point[]; target: string | null } {
  const start = { x: Math.round(hero.x), y: Math.round(hero.y) };
  const queue = [start];
  const dist = new Map<string, number>([[keyOf(start), 0]]);
  const parents = new Map<string, Point | null>([[keyOf(start), null]]);
  const pathTo = (end: Point) => {
    const path: Point[] = [];
    let p: Point | null = end;
    while (p && keyOf(p) !== keyOf(start)) {
      path.push(p);
      p = parents.get(keyOf(p)) ?? null;
    }
    return path.reverse();
  };
  let best: { p: Point; target: string; score: number } | null = null;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i]!;
    const d = dist.get(keyOf(p))!;
    // Prune: a far tile can't beat the best score (max realistic value ~ 4 * 6).
    if (best && 24 / (d + 2) < best.score) break;
    if (!danger.has(keyOf(p))) {
      const blast = blastTiles(state, { x: p.x, y: p.y, range: hero.bombRange });
      let value = 0;
      let target: string | null = null;
      let targetValue = -1;
      for (const t of blast) {
        const k = keyOf(t);
        const node = state.nodes[k];
        if (!node || node.destroyed) continue;
        const base = (node.kind === "chest" ? 3 : 1) + Math.min(node.hp, 10) / 10;
        const v = reserved.has(k) ? base * 0.25 : base;
        value += v;
        if (v > targetValue) {
          targetValue = v;
          target = k;
        }
      }
      if (target && value > 0) {
        const score = value / (d + 2);
        if (
          (!best || score > best.score) &&
          canEscape(state, p, new Set(blast.map(keyOf)), danger)
        )
          best = { p, target, score };
      }
    }
    for (const dir of DIRECTIONS) {
      const next = { x: p.x + dir.x, y: p.y + dir.y };
      const key = keyOf(next);
      if (parents.has(key) || !walkable(state, next) || danger.has(key)) continue;
      parents.set(key, p);
      dist.set(key, d + 1);
      queue.push(next);
    }
  }
  if (best) return { path: pathTo(best.p), target: best.target };
  const choices = queue.filter(
    (p) => !danger.has(keyOf(p)) && Math.abs(p.x - start.x) + Math.abs(p.y - start.y) >= 3,
  );
  return {
    path: choices.length ? pathTo(choices[Math.floor(random(state) * choices.length)]!) : [],
    target: null,
  };
}
function escape(state: GameState, hero: GameHero, danger: Set<string>): Point[] {
  const start = { x: Math.round(hero.x), y: Math.round(hero.y) };
  const queue: { p: Point; path: Point[] }[] = [{ p: start, path: [] }];
  const seen = new Set([keyOf(start)]);
  for (let i = 0; i < queue.length; i++) {
    const { p, path } = queue[i]!;
    if (!danger.has(keyOf(p))) return path;
    for (const d of DIRECTIONS) {
      const next = { x: p.x + d.x, y: p.y + d.y };
      if (seen.has(keyOf(next)) || !walkable(state, next)) continue;
      seen.add(keyOf(next));
      queue.push({ p: next, path: [...path, next] });
    }
  }
  return [];
}
export function spawnHero(state: GameState, hero: GameHero): void {
  const occupied = Object.values(state.heroes).filter((h) => h.onMap && h.id !== hero.id);
  const choices: Point[] = [];
  for (let y = 1; y < MAP_HEIGHT - 1; y++)
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      if (
        walkable(state, { x, y }) &&
        !occupied.some((h) => Math.round(h.x) === x && Math.round(h.y) === y)
      )
        choices.push({ x, y });
    }
  for (const distance of [7, 5, 3, 1, 0]) {
    const candidates = choices.filter((p) =>
      occupied.every((h) => Math.abs(h.x - p.x) + Math.abs(h.y - p.y) >= distance),
    );
    if (candidates.length) {
      Object.assign(hero, candidates[Math.floor(random(state) * candidates.length)]);
      break;
    }
  }
  hero.path = [];
  hero.target = null;
  hero.phase = "searching";
}
export function refreshAllowance(state: GameState, now: number): void {
  const date = utcDate(now);
  if (state.daily.date !== date) state.daily = { date, used: 0, cap: state.daily.cap };
  state.daily.cap = Object.values(state.heroes).reduce(
    (sum, h) => sum + (DAILY_CHEST_CAP_PER_HERO[h.rarity] ?? DAILY_CHEST_CAP_PER_HERO['common'] ?? 0),
    0,
  );
}
/** Mutates only the supplied candidate. Callers publish it only after persistence succeeds. */
export function applyCommand(
  state: GameState,
  command: GameCommand,
  now: number,
): string | undefined {
  materializeRecovery(state, now);
  if (command.type === "pause") {
    state.paused = command.paused;
    return;
  }
  const hero = state.heroes[command.heroId];
  if (!hero || hero.owner !== state.playerId || hero.market.listed) return "HERO_UNAVAILABLE";
  if (command.type === "recall") {
    if (hero.onMap) {
      hero.onMap = false;
      hero.path = [];
      hero.target = null;
      hero.recoveryAt = now;
    }
    return;
  }
  if (hero.onMap) return;
  if (!canDeployEnergy(hero.energy, hero.maxEnergy)) return "INSUFFICIENT_ENERGY";
  if (Object.values(state.heroes).filter((h) => h.onMap).length >= MAX_ON_MAP) return "MAP_FULL";
  hero.onMap = true;
  spawnHero(state, hero);
  return undefined;
}
export function advanceStage(state: GameState): boolean {
  if (state.bombs && Object.keys(state.bombs).length) return false;
  const chests = Object.values(state.nodes).filter((n) => n.kind === "chest");
  if (!chests.length || chests.some((n) => !n.destroyed)) return false;
  state.stage++;
  state.seed = Math.floor(random(state) * 2147483648);
  state.mapId = `${state.runId}:${state.stage}:${state.seed}`;
  state.nodes = Object.fromEntries(
    generateStageMap(state.stage, state.seed).map((n) => [keyOf(n), n]),
  );
  for (const hero of Object.values(state.heroes).sort((a, b) => a.id.localeCompare(b.id)))
    if (hero.onMap) spawnHero(state, hero);
  return true;
}
export function stepSimulation(state: GameState, deltaMs: number, now: number): SimulationResult {
  const result: SimulationResult = {
    state,
    durable: false,
    effects: [],
    rewards: [],
    resolvedBombs: [],
  };
  if (state.paused) return result;
  state.time += Math.max(0, Math.min(deltaMs, 100));
  refreshAllowance(state, now);
  const orderedBombs = Object.values(state.bombs).sort(
    (a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id),
  );
  let nodesCopied = false;
  for (const bomb of orderedBombs) {
    if (bomb.dueAt > state.time) continue;
    const tiles = blastTiles(state, bomb);
    const keys = tiles.map(keyOf).sort((a, b) => {
      const [ax = 0, ay = 0] = a.split(",").map(Number),
        [bx = 0, by = 0] = b.split(",").map(Number);
      return ay - by || ax - bx;
    });
    for (const key of keys) {
      const existing = state.nodes[key];
      if (!existing || existing.destroyed) continue;
      if (!nodesCopied) {
        state.nodes = { ...state.nodes };
        nodesCopied = true;
      }
      const node = (state.nodes[key] = { ...existing });
      node.hp = Math.max(0, node.hp - bomb.power);
      node.destroyed = node.hp === 0;
      if (node.destroyed && node.kind === "chest") {
        const amount = node.coins;
        const receipt = { id: `chest:${state.mapId}:${key}`, nodeKey: key, amount };
        result.rewards.push(receipt);
        result.effects.push({ type: "reward", ...receipt });
      }
    }
    delete state.bombs[bomb.id];
    const hero = state.heroes[bomb.heroId];
    if (hero) {
      hero.energy = Math.max(0, hero.energy - 1);
      if (hero.energy < 1) {
        hero.onMap = false;
        hero.path = [];
        hero.target = null;
      }
      if (!hero.onMap) hero.recoveryAt = now;
    }
    result.effects.push({ type: "explosion", id: bomb.id, tiles });
    result.resolvedBombs.push(bomb.id);
    result.durable = true;
  }
  // Working heroes never recover. Pin their rest clock to now, and recall any
  // hero that can no longer afford a bomb straight off the map.
  for (const hero of Object.values(state.heroes)) {
    if (!hero.onMap) continue;
    hero.recoveryAt = now;
    const pending = Object.values(state.bombs).some((b) => b.heroId === hero.id);
    if (hero.energy < 1 && !pending) {
      hero.onMap = false;
      hero.path = [];
      hero.target = null;
      result.durable = true;
    }
  }
  result.rewards.sort((a, b) => {
    const [ax = 0, ay = 0] = a.nodeKey.split(",").map(Number),
      [bx = 0, by = 0] = b.nodeKey.split(",").map(Number);
    return ay - by || ax - bx;
  });
  for (const reward of result.rewards) {
    reward.amount = state.daily.used < state.daily.cap ? reward.amount : 0;
    if (reward.amount > 0) state.daily.used++;
    state.coins += reward.amount;
    const effect = result.effects.find((e) => e.type === "reward" && e.id === reward.id);
    if (effect?.type === "reward") effect.amount = reward.amount;
  }
  // Saved games: only the server picks the next stage/seed. Advancing locally
  // rolls a random seed the server rejects, looping the player back a stage.
  if (state.playerId === "demo" && advanceStage(state)) {
    result.effects.push({ type: "stage", id: state.mapId, stage: state.stage });
    result.durable = true;
    return result;
  }
  const hasChests = Object.values(state.nodes).some((n) => n.kind === "chest" && !n.destroyed);
  const danger = new Set(
    Object.values(state.bombs).flatMap((b) => blastTiles(state, b).map(keyOf)),
  );
  const reserved = new Set(
    Object.values(state.heroes).flatMap((h) => (h.target ? [h.target] : [])),
  );
  for (const hero of Object.values(state.heroes).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!hero.onMap || !hasChests) continue;
    if (hero.target && state.nodes[hero.target]?.destroyed) {
      reserved.delete(hero.target);
      hero.target = null;
      hero.path = [];
    }
    let distance = (movementSpeed(hero.speed) * Math.max(0, Math.min(deltaMs, 100))) / 1000;
    while (hero.path.length && distance > 0) {
      const p = hero.path[0]!;
      if (!walkable(state, p)) {
        hero.path = [];
        hero.target = null;
        break;
      }
      const remaining = Math.abs(p.x - hero.x) + Math.abs(p.y - hero.y);
      if (remaining <= distance) {
        hero.x = p.x;
        hero.y = p.y;
        distance -= remaining;
        hero.path.shift();
      } else {
        const ratio = distance / remaining;
        hero.x += (p.x - hero.x) * ratio;
        hero.y += (p.y - hero.y) * ratio;
        distance = 0;
      }
    }
    if (hero.path.length) continue;
    if (hero.target && !danger.has(keyOf(hero))) {
      const owned = Object.values(state.bombs).filter((b) => b.heroId === hero.id).length;
      const hit = blastTiles(state, {
        x: Math.round(hero.x),
        y: Math.round(hero.y),
        range: hero.bombRange,
      }).some((p) => state.nodes[keyOf(p)] && !state.nodes[keyOf(p)]!.destroyed);
      if (owned < hero.bombNumber && hero.energy - owned >= 1 && hit) {
        const id = `${state.mapId}:bomb:${++state.bombSerial}`;
        const bomb: GameBomb = {
          id,
          heroId: hero.id,
          x: Math.round(hero.x),
          y: Math.round(hero.y),
          range: hero.bombRange,
          power: hero.power,
          dueAt: state.time + BOMB_FUSE_MS,
        };
        state.bombs[id] = bomb;
        for (const p of blastTiles(state, bomb)) danger.add(keyOf(p));
        hero.path = escape(state, hero, danger);
        hero.phase = "escaping";
        result.durable = true;
      }
      reserved.delete(hero.target);
      hero.target = null;
      if (hero.path.length) continue;
    }
    const next = search(state, hero, danger, reserved);
    hero.path = next.path;
    hero.target = next.target;
    hero.phase = hero.path.length ? "moving" : "searching";
    if (hero.target) reserved.add(hero.target);
  }
  return result;
}
