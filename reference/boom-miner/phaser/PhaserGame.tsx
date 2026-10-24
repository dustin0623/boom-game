"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/features/store/gameStore";
import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from "@/features/types/TileTypes";
import { GAME_CONFIG } from "./config/GameConfig";
import { initSocket, destroySocket, setGameVisibility } from "@/context/SocketContext";

export function PhaserGame() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Initialise the shared socket before Phaser boots so WSSyncManager.start()
    // finds an existing socket on its first call and only registers listeners once.
    initSocket();

    let destroyed = false;
    let gameInstance: import("phaser").Game | null = null;

    (async () => {
      const Phaser = await import("phaser");
      const { BootScene } = await import("./scenes/BootScene");
      const { TreasureScene } = await import("./scenes/TreasureScene");
      if (destroyed || !hostRef.current) return;

      gameInstance = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: MAP_WIDTH * TILE_SIZE,
        height: MAP_HEIGHT * TILE_SIZE,
        backgroundColor: GAME_CONFIG.RENDER.BG_COLOR,
        scene: [BootScene, TreasureScene],
        fps: { target: GAME_CONFIG.RENDER.FPS_TARGET, forceSetTimeOut: false },
        render: { pixelArt: GAME_CONFIG.RENDER.PIXEL_ART, antialias: GAME_CONFIG.RENDER.ANTIALIAS },
        banner: false,
      });
      (window as unknown as { __phaser?: import("phaser").Game }).__phaser = gameInstance;
    })();

    const onVisibility = () => setGameVisibility(document.hidden || !document.hasFocus());
    const onBlur = () => setGameVisibility(true);
    const onFocus = () => setGameVisibility(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    return () => {
      destroyed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      gameInstance?.destroy(true);
      useGameStore.getState().setMapHeroes([]);
      // Fully tear down the shared WS socket when the game unmounts (e.g.
      // navigating away / logout). It intentionally survives scene restarts,
      // so it must be closed here rather than in the scene shutdown handler.
      destroySocket();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      style={{
        width: MAP_WIDTH * TILE_SIZE,
        height: MAP_HEIGHT * TILE_SIZE,
        display: "block",
      }}
    />
  );
}
