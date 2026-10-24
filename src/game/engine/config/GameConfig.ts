/**
 * GameConfig
 * Pure engine-tuning constants for the boom-miner Phaser engine.
 * No Phaser API calls. No imports from game code.
 *
 * Domain constants that are shared with non-engine code (map dimensions in
 * `features/types/TileTypes`, hero sprite-sheet layout in
 * `features/types/HeroRarity`) intentionally live next to their data and are
 * NOT duplicated here.
 */

export const GAME_CONFIG = {
  /** Phaser.Game render settings (see PhaserGame.tsx). */
  RENDER: {
    BG_COLOR: "#1a2b1a",
    FPS_TARGET: 60,
    PIXEL_ART: false,
    ANTIALIAS: true,
  },

  /** BootScene camera background while assets load. */
  BOOT_BG_COLOR: "#0a0a0a",

  /** Delay (ms) after the loader hits 100% before starting the game scene. */
  BOOT_START_DELAY_MS: 300,

  /** Hero movement + rendering. */
  HERO: {
    SPRITE_SCALE: 1.6, // 16x20 -> ~26x32
    /** Vertical draw offset (px) so feet sit on the tile. */
    Y_OFFSET: 2,
    DEPTH: 10,
    /** 1px rarity outline glow (Phaser preFX.addGlow args). */
    GLOW: {
      padding: 2,
      outerStrength: 2,
      innerStrength: 0,
      knockout: false,
      quality: 0.1,
      distance: 8,
    },
  },

  /** Bomb visuals. */
  BOMB: {
    DEPTH: 8,
  },

  /** Explosion visuals + juice. */
  EXPLOSION: {
    DURATION_MS: 300,
    DEPTH: 9,
    SFX_VOLUME: 0.35,
    SFX_DETUNE: 150,
    SHAKE_DURATION_MS: 160,
    SHAKE_BASE: 0.002,
    SHAKE_PER_RANGE: 0.001,
    SHAKE_MAX: 0.006,
    SHAKE_SCALE: 0.5,
  },
} as const;
