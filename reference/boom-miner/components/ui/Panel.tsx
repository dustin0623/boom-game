"use client";

import React from "react";
import { clsx } from "clsx";

/**
 * Pixel-art wood panels.
 *
 * The frame + fill styling lives in globals.css as reusable utility classes
 * (`wood-frame-*`, `wood-panel-*`) so the border-image slice math stays in one
 * place. The source PNGs are 9x9, so the frame classes use a `3` slice — a
 * larger slice (e.g. 30) is invalid for a 9px image and makes the browser drop
 * the border-image entirely, which showed up as flat/no borders.
 *
 * The `wood` keyword prefix keeps this palette from clashing with the app's
 * existing brown-* Tailwind tokens.
 */

interface Props {
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  children?: React.ReactNode;
}

/** Convenience wrapper — OuterPanel + InnerPanel stacked. */
export const Panel: React.FC<Props> = ({ children, className, style, onClick }) => (
  <OuterPanel className={className} style={style} onClick={onClick}>
    <InnerPanel>{children}</InnerPanel>
  </OuterPanel>
);

/** Dark-bordered outer frame. Use as the modal/card container background. */
export const OuterPanel: React.FC<Props> = ({ children, className, style, onClick }) => (
  <div
    className={clsx(
      "wood-frame-dark wood-panel-outer p-0.5 shadow-lg text-shadow text-xs sm:text-sm",
      className,
    )}
    onClick={onClick}
    style={style}
  >
    {children}
  </div>
);

/**
 * Light-bordered inner frame. Use for title bars, action docks, body areas,
 * and active nav-rail chips inside an OuterPanel.
 */
export const InnerPanel: React.FC<Props> = ({ children, className, style, onClick }) => (
  <div
    className={clsx("wood-frame-light wood-panel-inner p-1", className)}
    onClick={onClick}
    style={style}
  >
    {children}
  </div>
);
