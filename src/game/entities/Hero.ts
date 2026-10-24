import * as Phaser from "phaser";
import { TILE_SIZE } from "@/game/data/TileTypes";
import {
  HERO_FACING_ROW,
  HERO_RARITY_DEFS,
  HERO_SPRITES,
  HERO_SPRITE_COLS,
  HeroFacing,
  HeroRarity,
  HeroType,
} from "@/game/data/HeroRarity";
import { GAME_CONFIG } from "../engine/config/GameConfig";

export interface HeroConfig {
  id: string;
  tileX: number;
  tileY: number;
  rarity: HeroRarity;
  type: HeroType;
  preset: {
    power: number;
    speed: number;
    stamina: number;
    bombNum: number;
    bombRange: number;
    energy: number;
  };
}

export class Hero {
  readonly id: string;
  readonly rarity: HeroRarity;
  readonly type: HeroType;
  x: number;
  y: number;

  facing: HeroFacing = "down";
  moving = false;

  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Sprite;
  private spriteKey: string;
  private barGfx: Phaser.GameObjects.Graphics;

  /** Stamina bar dimensions (px). */
  private static readonly BAR_W  = 22;
  private static readonly BAR_H  = 3;
  /** Y offset above the sprite centre. */
  private static readonly BAR_Y_OFFSET = -20;

  constructor(scene: Phaser.Scene, cfg: HeroConfig) {
    this.scene = scene;
    this.id = cfg.id;
    this.rarity = cfg.rarity;
    this.type = cfg.type;
    this.x = cfg.tileX * TILE_SIZE + TILE_SIZE / 2;
    this.y = cfg.tileY * TILE_SIZE + TILE_SIZE / 2;

    this.spriteKey = `hero_${HERO_SPRITES[this.type]}`;
    // Walk-cycle anims are registered up-front by the AnimationSystem in
    // BootScene, so there's no per-hero animation setup here.

    const hero = GAME_CONFIG.HERO;
    this.sprite = scene.add.sprite(this.x, this.y + hero.Y_OFFSET, this.spriteKey, 0);
    this.sprite.setScale(hero.SPRITE_SCALE);
    this.sprite.setDepth(hero.DEPTH);

    // 1px rarity outline glow around the sprite.
    const fx = this.sprite.preFX;
    if (fx) {
      fx.setPadding(hero.GLOW.padding);
      fx.addGlow(
        this.rarityTint,
        hero.GLOW.outerStrength,
        hero.GLOW.innerStrength,
        hero.GLOW.knockout,
        hero.GLOW.quality,
        hero.GLOW.distance,
      );
    }

    // Stamina bar — drawn above the hero sprite.
    this.barGfx = scene.add.graphics();
    this.barGfx.setDepth(GAME_CONFIG.HERO.DEPTH + 1);

    this.draw();
    // Render bar at full energy on spawn.
    this.updateEnergyBar(cfg.preset.energy, cfg.preset.energy);
  }

  get rarityTint(): number {
    return HERO_RARITY_DEFS[this.rarity].tint;
  }

  get rarityLabel(): string {
    return HERO_RARITY_DEFS[this.rarity].label;
  }

  setFacingFromDelta(dx: number, dy: number): void {
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.facing = dx > 0 ? "right" : "left";
    } else {
      this.facing = dy > 0 ? "down" : "up";
    }
  }

  setMoving(moving: boolean): void {
    this.moving = moving;
    const animKey = `${this.spriteKey}_${this.facing}`;
    if (moving) {
      const current = this.sprite.anims.currentAnim;
      if (!current || current.key !== animKey || !this.sprite.anims.isPlaying) {
        this.sprite.anims.play(animKey, true);
      }
    } else {
      this.sprite.anims.stop();
      this.sprite.setFrame(HERO_FACING_ROW[this.facing] * HERO_SPRITE_COLS);
    }
  }

  draw(): void {
    const sx = Math.round(this.x);
    const sy = Math.round(this.y + GAME_CONFIG.HERO.Y_OFFSET);
    this.sprite.setPosition(sx, sy);
    // Position the bar above the sprite. The bar itself is drawn relative to (0,0),
    // so we just set the Graphics position to where it should appear.
    this.barGfx.setPosition(sx - Hero.BAR_W / 2, sy + Hero.BAR_Y_OFFSET);
  }

  /**
   * Redraws the stamina bar above the hero sprite.
   * Called each time the store pushes a fresh currentEnergy value.
   * Draws relative to (0,0) — the Graphics position is set separately in draw().
   * @param current - current energy (may be a fraction)
   * @param max     - max energy from the authoritative hero
   */
  updateEnergyBar(current: number, max: number): void {
    const ratio = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;

    this.barGfx.clear();

    // Background track (relative coordinates).
    this.barGfx.fillStyle(0x000000, 0.65);
    this.barGfx.fillRect(-1, -1, Hero.BAR_W + 2, Hero.BAR_H + 2);

    // Empty portion.
    this.barGfx.fillStyle(0x333333, 1);
    this.barGfx.fillRect(0, 0, Hero.BAR_W, Hero.BAR_H);

    // Filled portion — colour shifts green → yellow → red as energy drops.
    const fill =
      ratio > 0.6 ? 0x44dd44 :
      ratio > 0.3 ? 0xffcc00 :
                    0xff4444;
    const fillW = Math.round(Hero.BAR_W * ratio);
    if (fillW > 0) {
      this.barGfx.fillStyle(fill, 1);
      this.barGfx.fillRect(0, 0, fillW, Hero.BAR_H);
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.barGfx.destroy();
  }
}
