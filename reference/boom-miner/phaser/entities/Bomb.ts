import type * as Phaser from 'phaser';
import { TILE_SIZE } from '@/features/types/TileTypes';
import { BOMB_FUSE_MS } from '@/features/game/rules';
import { GAME_CONFIG } from '../config/GameConfig';

/** Fuse animation only; the service decides when the bomb resolves. */
export class Bomb {
  detonateAt = 0;
  private gfx: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene, private tileX: number, private tileY: number) {
    this.gfx = scene.add.graphics().setDepth(GAME_CONFIG.BOMB.DEPTH);
  }
  update(now: number): void {
    const progress = 1 - Math.min(BOMB_FUSE_MS, Math.max(0, this.detonateAt - now)) / BOMB_FUSE_MS;
    const px = (this.tileX + 0.5) * TILE_SIZE, py = (this.tileY + 0.5) * TILE_SIZE;
    const radius = (TILE_SIZE / 2 - 6) * (1 + Math.sin(progress * Math.PI * 8) * 0.08);
    this.gfx.clear();
    this.gfx.fillStyle(0x000000).fillCircle(px, py, radius);
    this.gfx.fillStyle(0xff5a1f).fillCircle(px + 4, py - radius + 2, 2);
  }
  destroy(): void { this.gfx.destroy(); }
}
