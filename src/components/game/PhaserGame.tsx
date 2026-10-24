import { useEffect, useRef } from "react";
import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from "@/game/data/TileTypes";
import { GAME_CONFIG } from "@/game/engine/config/GameConfig";

/** Mounts the Phaser world. Phaser is imported dynamically so it never runs during SSR. */
export function PhaserGame({ className, muted = false }: { className?: string; muted?: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let destroyed = false;
    let game: import("phaser").Game | null = null;
    (async () => {
      const Phaser = await import("phaser");
      const { BootScene } = await import("@/game/scenes/BootScene");
      const { TreasureScene } = await import("@/game/scenes/TreasureScene");
      if (destroyed || !hostRef.current) return;
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: MAP_WIDTH * TILE_SIZE,
        height: MAP_HEIGHT * TILE_SIZE,
        backgroundColor: GAME_CONFIG.RENDER.BG_COLOR,
        scene: [BootScene, TreasureScene],
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { pixelArt: true, antialias: false },
        audio: { noAudio: muted },
        banner: false,
      });
    })();
    return () => {
      destroyed = true;
      game?.destroy(true);
    };
  }, []);

  return <div ref={hostRef} className={className} style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }} />;
}
