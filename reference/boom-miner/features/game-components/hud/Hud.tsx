"use client";

import { ConnectionOverlay }      from "./components/ConnectionOverlay";
import { SessionErrorOverlay }    from "./components/SessionErrorOverlay";
import { StageValidationOverlay } from "./components/StageValidationOverlay";
import { DemoBanner }             from "./components/DemoBanner";

/**
 * Top-level HUD compositor — renders all in-game overlay layers.
 * Mounted by GameShell in phaser/HUD.tsx as a React sibling to the Phaser canvas.
 */
export function Hud() {
  return (
    <div data-html2canvas-ignore="true" aria-label="Game HUD">
      <ConnectionOverlay />
      <SessionErrorOverlay />
      <StageValidationOverlay />
      <DemoBanner />
    </div>
  );
}
