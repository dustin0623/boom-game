import type * as Phaser from "phaser";
import {
  HERO_FACING_ROW,
  HERO_SPRITES,
  HERO_SPRITE_COLS,
  type HeroFacing,
} from "@/features/types/HeroRarity";
import { HERO_WALK_ANIM, STATIC_ANIMS } from "../config/AnimationConfig";

const FACINGS: HeroFacing[] = ["down", "left", "right", "up"];

/**
 * AnimationSystem
 * Registers all Phaser animations once during scene create(), reading the
 * pure frame-data from AnimationConfig. Holds no per-frame state.
 */
export class AnimationSystem {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Register every animation the game needs. Safe to call once per boot. */
  registerAll(): void {
    this.createStaticAnimations();
    this.createHeroAnimations();
  }

  /** Single-texture animations (e.g. the explosion). */
  createStaticAnimations(): void {
    for (const conf of STATIC_ANIMS) {
      this.register(conf.key, conf.texture, conf.start, conf.end, conf.frameRate, conf.repeat);
    }
  }

  /** Directional walk cycles for every hero sprite sheet. */
  createHeroAnimations(): void {
    for (const key of Object.values(HERO_SPRITES)) {
      const texture = `hero_${key}`;
      for (const facing of FACINGS) {
        const start = HERO_FACING_ROW[facing] * HERO_SPRITE_COLS;
        this.register(
          `${texture}_${facing}`,
          texture,
          start,
          start + HERO_SPRITE_COLS - 1,
          HERO_WALK_ANIM.frameRate,
          HERO_WALK_ANIM.repeat,
        );
      }
    }
  }

  private register(
    key: string,
    texture: string,
    start: number,
    end: number,
    frameRate: number,
    repeat: number,
  ): void {
    if (this.scene.anims.exists(key)) return;
    if (!this.scene.textures.exists(texture)) {
      console.warn(`[AnimationSystem] Skipping "${key}" — texture "${texture}" not loaded`);
      return;
    }
    this.scene.anims.create({
      key,
      frames: this.scene.anims.generateFrameNumbers(texture, { start, end }),
      frameRate,
      repeat,
    });
  }
}
