import * as Phaser from "phaser";
import { MapManager } from "../systems/MapManager";
import { Hero } from "../entities/Hero";
import { Bomb } from "../entities/Bomb";
import { TILE_SIZE } from "@/game/data/TileTypes";
import { HeroRarity, HeroType, HERO_RARITY_DEFS } from "@/game/data/HeroRarity";
import { useGameStore } from "@/features/store/gameStore";
import { subscribeGame } from "@/context/SocketContext";
import type { GameEffect, GameState } from "@/lib/game/dungeon/types";
import { stepSimulation } from "@/lib/game/dungeon/simulation";
import { STATIC_ANIMS } from "../engine/config/AnimationConfig";
import { GAME_CONFIG } from "../engine/config/GameConfig";
import { createDemo } from "../demo/demo";

/** Real gameplay is rendered from the service. Only the isolated demo runs locally. */
export class TreasureScene extends Phaser.Scene {
  private map!: MapManager;
  private state: GameState | null = null;
  private heroes = new Map<string, Hero>();
  private bombs = new Map<string, Bomb>();
  private unsubscribe?: () => void;
  private mapId = "";
  private demo: GameState | null = null;
  private demoElapsed = 0;
  private receivedAt = 0;
  constructor() {
    super("TreasureScene");
  }
  create(): void {
    this.map = new MapManager(this);
    this.unsubscribe = subscribeGame((state, effects) => {
      if (!Object.keys(state.heroes).length) {
        if (!this.demo) this.demo = createDemo(state);
        useGameStore.getState().setDemoMode(true);
        return;
      }
      this.demo = null;
      useGameStore.getState().setDemoMode(false);
      this.apply(state, effects);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.clearEntities();
      this.demo = null;
      useGameStore.getState().setDemoMode(false);
    });
  }
  private clearEntities(): void {
    this.heroes.forEach((h) => h.destroy());
    this.heroes.clear();
    this.bombs.forEach((b) => b.destroy());
    this.bombs.clear();
  }
  private apply(state: GameState, effects: GameEffect[]): void {
    const nodesChanged = this.state?.nodes !== state.nodes || state.mapId !== this.mapId;
    if (state.mapId !== this.mapId) {
      const advanced = this.mapId !== "" && this.state !== null && state.stage > this.state.stage;
      this.clearEntities();
      this.mapId = state.mapId;
      if (advanced && !this.demo) {
        useGameStore.getState().setStageValidated(true);
        this.time.delayedCall(1800, () => useGameStore.getState().setStageValidated(false));
      }
    }
    this.state = state;
    this.receivedAt = this.time.now;
    if (nodesChanged) this.map.apply(state);
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
      if (!this.bombs.has(b.id))
        this.bombs.set(b.id, new Bomb(this, b.x, b.y));
      this.bombs.get(b.id)!.detonateAt = b.dueAt;
    }
    for (const effect of effects) this.effect(effect, state);
    if (!this.demo)
      useGameStore.getState().setMapHeroes(
        Object.values(state.heroes)
          .filter((h) => h.onMap)
          .map((h) => ({
            id: h.id,
            tileX: h.x,
            tileY: h.y,
            state: h.phase,
            type: h.type,
            rarity: h.rarity,
            rarityLabel: HERO_RARITY_DEFS[h.rarity as HeroRarity]?.label ?? h.rarity,
            power: h.power,
            speed: h.speed,
            stamina: h.stamina,
            bombNum: h.bombNumber,
            bombRange: h.bombRange,
            energy: h.maxEnergy,
            currentEnergy: h.energy,
          })),
      );
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
      if (this.cache.audio.exists("boom_sfx"))
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
  update(_time: number, delta: number): void {
    const store = useGameStore.getState();
    if (store.connectionLost || store.sessionError || store.gamePaused) return;
    if (this.demo) {
      this.demoElapsed += delta;
      if (this.demoElapsed >= 100) {
        this.demoElapsed = 0;
        for (const hero of Object.values(this.demo.heroes)) {
          hero.energy = hero.maxEnergy;
          hero.onMap = true;
        }
        const result = stepSimulation(this.demo, 100, Date.now());
        this.apply(result.state, result.effects);
      }
    }
    if (!this.state || this.state.paused) return;
    for (const h of Object.values(this.state.heroes)) {
      const sprite = this.heroes.get(h.id);
      if (!sprite) continue;
      const tx = (h.x + 0.5) * TILE_SIZE,
        ty = (h.y + 0.5) * TILE_SIZE;
      const dx = tx - sprite.x,
        dy = ty - sprite.y;
      const distance = Math.hypot(dx, dy);
      const blend = Math.min(1, delta / 80);
      sprite.setFacingFromDelta(dx, dy);
      sprite.setMoving(distance > 0.2);
      sprite.x += dx * blend;
      sprite.y += dy * blend;
      sprite.draw();
    }
    const visualTime = this.state.time + Math.min(100, this.time.now - this.receivedAt);
    this.bombs.forEach((bomb) => bomb.update(visualTime));
  }
}
