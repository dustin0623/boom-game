export enum TileType {
  Grass = 0,
  Wall = 1,
  Chest = 2,
  Bush = 3,
  Tree = 4,
}

export const TILE_SIZE = 32;
export const MAP_WIDTH = 41;
export const MAP_HEIGHT = 25;

export const DESTRUCTIBLE_TILES: ReadonlySet<TileType> = new Set([
  TileType.Chest,
  TileType.Bush,
  TileType.Tree,
]);

export const isWalkable = (t: TileType): boolean => t === TileType.Grass;
export const isDestructible = (t: TileType): boolean => DESTRUCTIBLE_TILES.has(t);
