import * as Phaser from "phaser";
import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from "@/game/data/TileTypes";
import { CHEST_TEXTURE, ChestRarity } from "@/game/data/ChestRarity";
import type { GameNode, GameState } from "@/lib/game/dungeon/types";
import { isWall } from "@/lib/game/dungeon/simulation";

const PALETTES = [
  [0x4ea24e, 0x3d7a3d, 0x555555, 0x333333],
  [0xc9a26b, 0x8a6a3f, 0x7a4a2a, 0x4a2a15],
  [0x6b7a99, 0x3f4a63, 0x2f3a52, 0x1a1f2e],
  [0x5a3a2e, 0x3e1f18, 0x8a2a2a, 0x4a1010],
  [0x3a2a4e, 0x1f1530, 0x5e3a8a, 0x2a1548],
];

/** Presentation only: node HP and destruction always come from the game state. */
export class MapManager {
  private mapId = "";
  private ground: Phaser.GameObjects.Graphics;
  private health: Phaser.GameObjects.Graphics;
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  private nodes: Record<string, GameNode> = {};
  constructor(private scene: Phaser.Scene) {
    this.ground = scene.add.graphics().setDepth(0);
    this.health = scene.add.graphics().setDepth(5);
  }
  apply(state: GameState): void {
    if (state.mapId !== this.mapId) {
      this.mapId = state.mapId;
      this.sprites.forEach((sprite) => sprite.destroy());
      this.sprites.clear();
      this.nodes = {};
      const [fill, stroke, wall, wallStroke] = PALETTES[(state.stage - 1) % PALETTES.length]!;
      this.ground.clear();
      for (let y = 0; y < MAP_HEIGHT; y++)
        for (let x = 0; x < MAP_WIDTH; x++) {
          const px = x * TILE_SIZE,
            py = y * TILE_SIZE;
          this.ground.fillStyle(fill).fillRect(px, py, TILE_SIZE, TILE_SIZE);
          this.ground.lineStyle(1, stroke, 0.4).strokeRect(px, py, TILE_SIZE, TILE_SIZE);
          if (isWall(x, y)) {
            this.ground.fillStyle(wall).fillRect(px, py, TILE_SIZE, TILE_SIZE);
            this.ground
              .lineStyle(2, wallStroke)
              .strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          }
        }
    }
    for (const [key, sprite] of this.sprites)
      if (!state.nodes[key] || state.nodes[key].destroyed) {
        sprite.destroy();
        this.sprites.delete(key);
      }
    for (const [key, node] of Object.entries(state.nodes)) {
      if (node.destroyed || this.sprites.has(key)) continue;
      const texture = node.kind === "chest" ? CHEST_TEXTURE[node.rarity as ChestRarity] : "bush";
      this.sprites.set(
        key,
        this.scene.add
          .image((node.x + 0.5) * TILE_SIZE, (node.y + 0.5) * TILE_SIZE, texture)
          .setDepth(4)
          .setDisplaySize(TILE_SIZE - 4, TILE_SIZE - 4),
      );
    }
    this.nodes = state.nodes;
    this.health.clear();
    for (const node of Object.values(this.nodes)) {
      if (node.destroyed || node.hp >= node.maxHp || node.maxHp <= 1) continue;
      const width = TILE_SIZE - 6;
      this.health
        .fillStyle(0x000000, 0.6)
        .fillRect(node.x * TILE_SIZE + 3, node.y * TILE_SIZE + 2, width, 4);
      this.health
        .fillStyle(0x22dd55)
        .fillRect(
          node.x * TILE_SIZE + 3,
          node.y * TILE_SIZE + 2,
          (width * node.hp) / node.maxHp,
          4,
        );
    }
  }
}
