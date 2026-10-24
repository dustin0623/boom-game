import * as Phaser from "phaser";
import { MapManager } from "../systems/MapManager";
import { Hero } from "../entities/Hero";
import { Bomb } from "../entities/Bomb";
import { TILE_SIZE } from "@/game/data/TileTypes";
import { HeroRarity, HeroType } from "@/game/data/HeroRarity";
import { useGameStore } from "@/features/stores/game.store";
import type { GameEffect, GameState } from "@/lib/game/dungeon/types";
import { applyCommand, stepSimulation } from "@/lib/game/dungeon/simulation";
import { materializeRecovery } from "@/lib/game/dungeon/rules";

const DEPLOY_ERRORS: Record<string, string> = {
  INSUFFICIENT_ENERGY: "Needs at least 50% energy to deploy",
  MAP_FULL: "The map is full — recall a hero first",
  HERO_UNAVAILABLE: "That hero is not available",
};

import { STATIC_ANIMS } from "../engine/config/AnimationConfig";
import { GAME_CONFIG } from "../engine/config/GameConfig";
import { createDemoState, createSessionState } from "../demo/demo";
import type { PlayerSession } from "@/lib/game/session/types";

const TICK_MS = 100;
const SYNC_INTERVAL_MS = 4000;
const HERO_SYNC_INTERVAL_MS = 5000;
/** How long the board stays frozen on "Stage cleared" while the server confirms. */
const STAGE_CLEAR_PAUSE_MS = 1600;

/**
 * Renders the local simulation. With a cloud session in the game store the
 * board is built from saved progress and destroyed blocks are synced to the
 * server every few seconds; without one (homepage backdrop) it runs unsaved.
 */
export class TreasureScene extends Phaser.Scene {
  private map!: MapManager;
  private state: GameState | null = null;
  private heroes = new Map<string, Hero>();
  private bombs = new Map<string, Bomb>();
  private mapId = "";
  /** Live simulation state for the current board. */
  private live: GameState | null = null;
  private tickElapsed = 0;
  private receivedAt = 0;
  /** Player is away (tab hidden / window blurred): heroes stop working. */
  private away = false;
  private session: PlayerSession | null = null;
  private pendingKeys = new Set<string>();
  /** Blocks already queued or saved on the current map (avoids resending cleared tiles). */
  private reportedKeys = new Set<string>();
  private syncElapsed = 0;
  private syncing = false;
  private awaitingStage = false;
  private stageHoldUntil = 0;
  constructor() {
    super("TreasureScene");
  }
  create(): void {
    this.map = new MapManager(this);
    this.session = useGameStore.getState().session;
    // Test bench only: expose the scene so /test-game can fast-forward a stage.
    if (this.session?.playerId === "test-player") (window as unknown as { __scene?: unknown }).__scene = this;
    this.pendingKeys.clear();
    this.reportedKeys = new Set<string>();
    this.syncElapsed = 0;
    this.syncing = false;
    this.awaitingStage = false;
    this.stageHoldUntil = 0;
    this.live = this.session ? createSessionState(this.session) : createDemoState();
    useGameStore.getState().reset();
    if (this.session) {
      this.restoreHeroes();
      if (!useGameStore.getState().inFlight) useGameStore.getState().setSaveStatus("saved");
    }
    this.restorePending();
    this.apply(this.live, []);
    // Save immediately when the player leaves the tab or page.
    const flushNow = () => {
      if (document.hidden) this.flush();
    };
    const onPageHide = () => this.flush();
    document.addEventListener("visibilitychange", flushNow);
    window.addEventListener("pagehide", onPageHide);
    // Kill any boom one-shots the moment the tab is hidden so they cannot pile
    // up while Phaser's audio is paused and blast all at once on return.
    const stopBooms = () => this.sound.getAll("boom_sfx").forEach((s) => s.stop());
    document.addEventListener("visibilitychange", stopBooms);
    window.addEventListener("blur", stopBooms);
    // Heroes stop working while the player is away (tab hidden or window blurred),
    // matching Boom Miner. Only the play session pauses; the homepage backdrop keeps running.
    const setAway = (away: boolean) => {
      if (!this.session || this.away === away) return;
      this.away = away;
      useGameStore.getState().setGamePaused(away);
      const now = Date.now();
      if (this.live) for (const h of Object.values(this.live.heroes)) if (h.onMap) h.recoveryAt = now;
      if (away) {
        this.heroes.forEach((s) => s.setMoving(false));
        this.flush();
      } else {
        this.tickElapsed = 0;
        this.receivedAt = this.time.now;
      }
    };
    const onVis = () => setAway(document.hidden || !document.hasFocus());
    const onBlur = () => setAway(true);
    const onFocus = () => setAway(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    this.away = false;
    useGameStore.getState().setGamePaused(false);
    if (this.session && (document.hidden || !document.hasFocus())) setAway(true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      useGameStore.getState().setGamePaused(false);
      document.removeEventListener("visibilitychange", stopBooms);
      window.removeEventListener("blur", stopBooms);
      document.removeEventListener("visibilitychange", flushNow);
      window.removeEventListener("pagehide", onPageHide);
      this.flush();
      this.clearEntities();
      this.live = null;
    });
  }
  /**
   * Heroes arrive with their server-saved energy and deploy state (applied by
   * createSessionState); clamp values and resume recovery from those stamps.
   */
  private restoreHeroes(): void {
    if (!this.live) return;
    const now = Date.now();
    for (const hero of Object.values(this.live.heroes)) {
      hero.energy = Math.min(hero.maxEnergy, Math.max(0, hero.energy));
      hero.onMap = hero.onMap && hero.energy >= 1;
      // A hero that was working starts resting only now, not from its old stamp.
      if (hero.onMap) hero.recoveryAt = now;
      hero.path = [];
      hero.target = null;
    }
    materializeRecovery(this.live, now);
  }
  /** Picks up heroes minted while the board is running; they arrive rested and off the map. */
  private adoptNewHeroes(): void {
    const latest = useGameStore.getState().session;
    if (!this.live || !this.session || !latest || latest.playerId !== this.session.playerId) return;
    if (latest.heroes.length === this.session.heroes.length) return;
    const now = Date.now();
    for (const h of latest.heroes) {
      if (this.live.heroes[h.id]) continue;
      this.live.heroes[h.id] = {
        ...h,
        mintedNumber: h.mintedNumber ?? 0,
        owner: latest.playerId,
        level: 1,
        energy: h.maxEnergy,
        onMap: false,
        recoveryAt: now,
        market: { listed: false, price: 0, seller: null, created: 0, sold: 0 },
        x: 1,
        y: 1,
        phase: "searching",
        path: [],
        target: null,
      };
    }
    this.session = latest;
  }
  private runCommands(): void {
    if (!this.live) return;
    const store = useGameStore.getState();
    for (const command of store.takeCommands()) {
      const error = applyCommand(this.live, command, Date.now());
      if (error) store.setDeployError(DEPLOY_ERRORS[error] ?? "Could not update hero");
    }
  }
  private lastHeroSync = 0;
  private publishRoster(): void {
    if (!this.live || !this.session) return;
    const heroes = Object.values(this.live.heroes);
    const byId = new Map(heroes.map((h) => [h.id, h]));
    useGameStore.getState().setRoster(
      this.session.heroes.map((h) => {
        const live = byId.get(h.id);
        return { ...h, energy: live?.energy ?? h.maxEnergy, onMap: live?.onMap ?? false };
      }),
    );
    this.syncHeroes(heroes, false);
  }
  /** Persists live hero energy/deploy state to the server (throttled unless forced). */
  private syncHeroes(heroes: GameState["heroes"][string][], force: boolean): void {
    const store = useGameStore.getState();
    const payload = heroes.map((h) => ({
      id: h.id,
      energy: Math.round(h.energy),
      onMap: h.onMap,
      recoveryAt: Math.round(h.recoveryAt),
    }));
    // Keep the cached session current so returning to Play resumes this exact state.
    store.patchSessionHeroes(payload);
    const heroesSyncer = store.heroesSyncer;
    if (!heroesSyncer) return;
    const now = Date.now();
    if (!force && now - this.lastHeroSync < HERO_SYNC_INTERVAL_MS) return;
    this.lastHeroSync = now;
    store.beginSave();
    heroesSyncer(payload)
      .then(() => useGameStore.getState().endSave(true))
      .catch(() => useGameStore.getState().endSave(false));
  }
  private clearEntities(): void {
    this.heroes.forEach((h) => h.destroy());
    this.heroes.clear();
    this.bombs.forEach((b) => b.destroy());
    this.bombs.clear();
  }
  private apply(state: GameState, effects: GameEffect[]): void {
    if (state.mapId !== this.mapId) {
      this.clearEntities();
      this.mapId = state.mapId;
    }
    this.state = state;
    this.receivedAt = this.time.now;
    this.map.apply(state);
    for (const [id, sprite] of this.heroes)
      if (!state.heroes[id]?.onMap) {
        sprite.destroy();
        this.heroes.delete(id);
      }
    for (const h of Object.values(state.heroes)) {
      if (!h.onMap) continue;
      if (!this.heroes.has(h.id))
        this.heroes.set(
          h.id,
          new Hero(this, {
            id: h.id,
            tileX: h.x,
            tileY: h.y,
            rarity: h.rarity as HeroRarity,
            type: h.type as HeroType,
            preset: {
              power: h.power,
              speed: h.speed,
              stamina: h.stamina,
              bombNum: h.bombNumber,
              bombRange: h.bombRange,
              energy: h.maxEnergy,
            },
          }),
        );
      this.heroes.get(h.id)!.updateEnergyBar(h.energy, h.maxEnergy);
    }
    for (const [id, sprite] of this.bombs)
      if (!state.bombs[id]) {
        sprite.destroy();
        this.bombs.delete(id);
      }
    for (const b of Object.values(state.bombs)) {
      if (!this.bombs.has(b.id)) this.bombs.set(b.id, new Bomb(this, b.x, b.y));
      this.bombs.get(b.id)!.detonateAt = b.dueAt;
    }
    for (const effect of effects) this.effect(effect, state);
    useGameStore.getState().setStats({
      coins: state.coins,
      stage: state.stage,
      heroesOnMap: Object.values(state.heroes).filter((h) => h.onMap).length,
    });
  }
  private effect(effect: GameEffect, state: GameState): void {
    if (effect.type === "explosion") {
      for (const tile of effect.tiles) {
        const sprite = this.add
          .sprite((tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE, "boom", 0)
          .setDepth(9)
          .setDisplaySize(TILE_SIZE, TILE_SIZE);
        sprite.play(STATIC_ANIMS[0].key);
        this.time.delayedCall(GAME_CONFIG.EXPLOSION.DURATION_MS, () => sprite.destroy());
      }
      // Never queue a boom while the tab is hidden — Phaser pauses audio on
      // blur and would replay every queued explosion simultaneously on return.
      if (this.cache.audio.exists("boom_sfx") && !document.hidden)
        this.sound.play("boom_sfx", { volume: GAME_CONFIG.EXPLOSION.SFX_VOLUME });
      this.cameras.main.shake(
        GAME_CONFIG.EXPLOSION.SHAKE_DURATION_MS,
        GAME_CONFIG.EXPLOSION.SHAKE_BASE * GAME_CONFIG.EXPLOSION.SHAKE_SCALE,
      );
    } else if (effect.type === "reward" && effect.amount > 0) {
      const node = state.nodes[effect.nodeKey];
      if (!node) return;
      const text = this.add
        .text((node.x + 0.5) * TILE_SIZE, node.y * TILE_SIZE, `+${effect.amount}`, {
          fontSize: "14px",
          color: "#ffdc66",
          stroke: "#332200",
          strokeThickness: 2,
        })
        .setDepth(12);
      this.tweens.add({
        targets: text,
        y: text.y - 24,
        alpha: 0,
        duration: 1000,
        onComplete: () => text.destroy(),
      });
    }
  }
  /** Remember blocks destroyed since the last confirmed server sync. */
  private trackDestroyed(effects: GameEffect[]): void {
    if (!this.live) return;
    for (const effect of effects) {
      if (effect.type === "explosion")
        for (const tile of effect.tiles) {
          const key = `${tile.x},${tile.y}`;
          const node = this.live.nodes[key];
          // Only blocks destroyed by this blast — not tiles cleared long ago.
          if (node?.destroyed && !this.reportedKeys.has(key)) {
            this.reportedKeys.add(key);
            this.pendingKeys.add(key);
          }
        }
      else if (effect.type === "reward" && !this.reportedKeys.has(effect.nodeKey)) {
        this.reportedKeys.add(effect.nodeKey);
        this.pendingKeys.add(effect.nodeKey);
      }
    }
    if (effects.length) this.persistPending();
  }

  private pendingStorageKey(): string | null {
    return this.live && this.session ? `chainframe.pending:${this.session.playerId}:${this.live.seed}` : null;
  }
  /** Unsaved blocks survive a refresh/crash: kept locally until the server confirms them. */
  private persistPending(): void {
    const key = this.pendingStorageKey();
    if (!key) return;
    try {
      if (this.pendingKeys.size) localStorage.setItem(key, JSON.stringify([...this.pendingKeys]));
      else localStorage.removeItem(key);
    } catch {
      /* storage full or blocked — server sync still runs */
    }
  }
  private restorePending(): void {
    const key = this.pendingStorageKey();
    if (!key || !this.live) return;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
      if (!Array.isArray(saved)) return;
      for (const k of saved) {
        const node = typeof k === "string" ? this.live.nodes[k] : undefined;
        if (!node || node.destroyed) continue;
        node.destroyed = true;
        this.pendingKeys.add(k);
      }
      if (this.pendingKeys.size) this.syncElapsed = SYNC_INTERVAL_MS;
    } catch {
      localStorage.removeItem(key);
    }
  }
  /** Send pending blocks and hero state right away (tab hidden, leaving the page). */
  private flush(): void {
    if (!this.session) return;
    if (this.live) this.syncHeroes(Object.values(this.live.heroes), true);
    if (!this.pendingKeys.size) return;
    this.syncElapsed = SYNC_INTERVAL_MS;
    this.tickSync(0);
  }

  /** Flush destroyed blocks to the server every few seconds and reconcile. */
  private tickSync(delta: number): void {
    this.syncElapsed += delta;
    if (this.syncElapsed < SYNC_INTERVAL_MS || this.syncing) return;
    const syncer = useGameStore.getState().syncer;
    const state = this.live;
    if (!syncer || !state || (!this.pendingKeys.size && !this.awaitingStage)) return;
    this.syncElapsed = 0;
    this.syncing = true;
    const sent = [...this.pendingKeys];
    useGameStore.getState().beginSave();
    syncer(state.seed, sent)
      .then((result) => {
        // Always cache the server-confirmed map, even if the scene has shut down
        // (player left Play) — otherwise returning would show stale progress.
        useGameStore.getState().patchSession({
          coins: result.coins,
          stage: result.stage,
          seed: result.seed,
          destroyedNodes: result.destroyedNodes,
        });
        useGameStore.getState().endSave(true);
        if (!this.live || this.live !== state) {
          try {
            const k = this.session && `chainframe.pending:${this.session.playerId}:${state.seed}`;
            const saved = new Set(result.destroyedNodes);
            const left = sent.filter((x) => result.seed === state.seed && !saved.has(x));
            if (k) left.length ? localStorage.setItem(k, JSON.stringify(left)) : localStorage.removeItem(k);
          } catch {
            /* ignore */
          }
          return;
        }
        // Only drop keys the server now has. Real blocks it deferred (e.g. the
        // chest rate limit) stay queued, otherwise the last chest can be lost
        // and the stage never clears.
        const saved = new Set(result.destroyedNodes);
        for (const key of sent) if (result.seed !== this.live.seed || saved.has(key)) this.pendingKeys.delete(key);
        this.persistPending();
        if (result.seed === this.live.seed && this.pendingKeys.size) this.syncElapsed = SYNC_INTERVAL_MS - 1000;
        this.live.coins = result.coins;
        if (result.stage !== this.live.stage || result.seed !== this.live.seed) {
          // Server confirmed the stage (or we drifted): hold the board frozen
          // briefly so the player sees the verification, then rebuild from the
          // server's official map. The pending list belongs to the old seed.
          this.awaitingStage = false;
          this.pendingKeys.clear();
          this.reportedKeys = new Set(result.destroyedNodes);
          this.persistPending();
          const previous = this.live.heroes;
          const playerId = this.live.playerId;
          this.stageHoldUntil = this.time.now + STAGE_CLEAR_PAUSE_MS;
          this.time.delayedCall(STAGE_CLEAR_PAUSE_MS, () => {
            if (!this.session || !this.scene.isActive()) return;
            this.live = createSessionState({
              playerId,
              coins: result.coins,
              stage: result.stage,
              seed: result.seed,
              destroyedNodes: result.destroyedNodes,
              heroes: this.session.heroes,
            });
            // Keep each hero's energy and deploy state across the new map.
            for (const hero of Object.values(this.live.heroes)) {
              const old = previous[hero.id];
              if (!old) continue;
              hero.energy = old.energy;
              hero.onMap = old.onMap;
              hero.recoveryAt = old.recoveryAt;
            }
            this.stageHoldUntil = 0;
            this.apply(this.live, []);
            useGameStore.getState().setStageClearing(false);
          });
        } else {
          useGameStore.getState().setStats({
            coins: result.coins,
            stage: this.live.stage,
            heroesOnMap: Object.values(this.live.heroes).filter((h) => h.onMap).length,
          });
        }
      })
      .catch(() => useGameStore.getState().endSave(false))
      .finally(() => {
        this.syncing = false;
      });
  }

  override update(_time: number, delta: number): void {
    // Clamp delta so a throttled background tab doesn't inject a multi-second
    // spike into the loop on the first frame back.
    delta = Math.min(delta, 250);
    // Player away: freeze everything. No ticks, no walking, no bombs, no stamina
    // change. Deployed heroes stay on the map and keep their rest clock pinned so
    // they never count away time as rest.
    if (this.away && this.session) {
      const now = Date.now();
      if (this.live) for (const h of Object.values(this.live.heroes)) if (h.onMap) h.recoveryAt = now;
      this.heroes.forEach((s) => s.setMoving(false));
      return;
    }
    if (this.live) {
      this.tickElapsed += delta;
      if (this.tickElapsed >= TICK_MS && !this.awaitingStage && this.time.now >= this.stageHoldUntil) {
        this.tickElapsed = 0;
        if (this.session) {
          this.adoptNewHeroes();
          this.runCommands();
          materializeRecovery(this.live, Date.now());
        } else {
          // Homepage backdrop: heroes never tire.
          for (const hero of Object.values(this.live.heroes)) {
            hero.energy = hero.maxEnergy;
            hero.onMap = true;
          }
        }
        this.live.daily.used = 0;
        const result = stepSimulation(this.live, TICK_MS, Date.now());
        this.live = result.state;
        if (this.session) this.trackDestroyed(result.effects);
        this.apply(result.state, result.effects);
        if (this.session) this.publishRoster();
        // In session mode the server owns stage advancement: once every chest
        // is gone locally, freeze the board, verify + save right away, and wait
        // for the server's official next map before resuming.
        if (
          this.session &&
          !this.awaitingStage &&
          !Object.values(this.live.nodes).some((n) => n.kind === "chest" && !n.destroyed)
        ) {
          this.awaitingStage = true;
          this.syncElapsed = SYNC_INTERVAL_MS;
          useGameStore.getState().setStageClearing(true);
        }
      }
      if (this.session) this.tickSync(delta);
    }
    if (!this.state || this.state.paused) return;
    for (const h of Object.values(this.state.heroes)) {
      const sprite = this.heroes.get(h.id);
      if (!sprite) continue;
      const tx = (h.x + 0.5) * TILE_SIZE;
      const ty = (h.y + 0.5) * TILE_SIZE;
      const dx = tx - sprite.x;
      const dy = ty - sprite.y;
      const blend = Math.min(1, delta / 80);
      sprite.setFacingFromDelta(dx, dy);
      sprite.setMoving(Math.hypot(dx, dy) > 0.2);
      sprite.x += dx * blend;
      sprite.y += dy * blend;
      sprite.draw();
    }
    const visualTime = this.state.time + Math.min(TICK_MS, this.time.now - this.receivedAt);
    this.bombs.forEach((bomb) => bomb.update(visualTime));
  }
}
