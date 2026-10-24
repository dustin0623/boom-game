'use client';

import { useEffect, useState, type CSSProperties } from "react";
import {
  HERO_SPRITES,
  HERO_SPRITE_FRAME_W,
  HERO_SPRITE_FRAME_H,
  HERO_SPRITE_COLS,
  type HeroType,
} from "@/features/types/HeroRarity";

const ROWS = 4;
const SHEET_W = HERO_SPRITE_FRAME_W * HERO_SPRITE_COLS;
const SHEET_H = HERO_SPRITE_FRAME_H * ROWS;

interface Props {
  type: HeroType;
  size: number;
  intervalMs?: number;
  /** If true, always show first frame of first row (no rotation). */
  static?: boolean;
}

/** Renders a hero sprite using the first frame (col 0) of each row,
 *  rotating through the 4 facings (down, left, right, up). */
export function HeroSprite({ type, size, intervalMs = 500, static: isStatic = false }: Props) {
  const [row, setRow] = useState(0);

  useEffect(() => {
    if (isStatic) return;
    const id = window.setInterval(() => {
      setRow((r) => (r + 1) % ROWS);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, isStatic]);

  const key = HERO_SPRITES[type];
  const scale = size / HERO_SPRITE_FRAME_W;
  const displayRow = isStatic ? 0 : row;

  // Sprite-sheet geometry is data-driven, so it is passed through CSS variables
  // and consumed by Tailwind arbitrary-value utilities below.
  const spriteVars = {
    "--sprite-w": `${HERO_SPRITE_FRAME_W * scale}px`,
    "--sprite-h": `${HERO_SPRITE_FRAME_H * scale}px`,
    "--sheet-w": `${SHEET_W * scale}px`,
    "--sheet-h": `${SHEET_H * scale}px`,
    "--sprite-url": `url(/assets/characters/${key}.png)`,
    "--sprite-y": `-${displayRow * HERO_SPRITE_FRAME_H * scale}px`,
  } as CSSProperties;

  return (
    <div
      style={spriteVars}
      className="pixelated h-[var(--sprite-h)] w-[var(--sprite-w)] bg-[image:var(--sprite-url)] bg-[length:var(--sheet-w)_var(--sheet-h)] bg-[position:0px_var(--sprite-y)] bg-no-repeat"
    />
  );
}
