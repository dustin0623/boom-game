import { cn } from "@/lib/utils";

/** First walk frame (16×20) of a 48×80 hero sheet, scaled with crisp pixels. */
export function HeroSprite({ sprite, scale = 4, className }: { sprite: string; scale?: number; className?: string }) {
  return (
    <div
      role="img"
      aria-label={sprite}
      className={cn("shrink-0", className)}
      style={{
        width: 16 * scale,
        height: 20 * scale,
        backgroundImage: `url(/game/sprites/players/${sprite}.png)`,
        backgroundSize: `${48 * scale}px ${80 * scale}px`,
        backgroundPosition: `-${16 * scale}px 0`,
        imageRendering: "pixelated",
      }}
    />
  );
}
