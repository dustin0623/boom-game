import * as Phaser from "phaser";
import { CHEST_TEXTURE, ChestRarity } from "@/features/types/ChestRarity";
import {
  HERO_SPRITES,
  HERO_SPRITE_FRAME_H,
  HERO_SPRITE_FRAME_W,
} from "@/features/types/HeroRarity";
import { loaderEvents } from "../loaderEvents";
import { GAME_CONFIG } from "../config/GameConfig";
import { AnimationSystem } from "../systems/AnimationSystem";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload(): void {
    loaderEvents.reset();
    this.cameras.main.setBackgroundColor(GAME_CONFIG.BOOT_BG_COLOR);

    this.load.on("progress", (value: number) => {
      loaderEvents.emitProgress(value);
    });
    this.load.on("fileprogress", (file: Phaser.Loader.File) => {
      loaderEvents.emitProgress(this.load.progress, file.key);
    });

    for (const rarity of Object.values(ChestRarity)) {
      this.load.image(CHEST_TEXTURE[rarity], `/assets/chests/${CHEST_TEXTURE[rarity]}.png`);
    }
    this.load.image("bush", "/assets/bush.png");
    this.load.spritesheet("boom", "/assets/boom.png", {
      frameWidth: 16,
      frameHeight: 16,
    });

    for (const key of Object.values(HERO_SPRITES)) {
      this.load.spritesheet(`hero_${key}`, `/assets/characters/${key}.png`, {
        frameWidth: HERO_SPRITE_FRAME_W,
        frameHeight: HERO_SPRITE_FRAME_H,
      });
    }
    this.load.audio("boom_sfx", "/audio/boom.wav");
  }

  create(): void {
    // Register every animation once from AnimationConfig. Registered anims live
    // on the global anim manager, so they persist across scene restarts.
    new AnimationSystem(this).registerAll();

    loaderEvents.emitProgress(1);
    this.time.delayedCall(GAME_CONFIG.BOOT_START_DELAY_MS, () => {
      loaderEvents.emitComplete();
      this.scene.start("TreasureScene");
    });
  }
}
