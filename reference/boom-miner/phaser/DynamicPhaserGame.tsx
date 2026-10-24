'use client';

import dynamic from "next/dynamic";
import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from "@/features/types/TileTypes";

/**
 * PhaserGame loaded with SSR disabled.
 * Phaser uses window/document/Audio/Canvas — it cannot run in Node.
 */
export const DynamicPhaserGame = dynamic(
  () => import("./PhaserGame").then((m) => m.PhaserGame),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: MAP_WIDTH * TILE_SIZE,
          height: MAP_HEIGHT * TILE_SIZE,
          background: "#1a1a1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      />
    ),
  }
);
