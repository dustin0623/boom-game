"use client";

import React, { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { OuterPanel } from "@/components/ui/Panel";

export type ModalTier = "toast" | "panel" | "fullscreen";

interface Props {
  show: boolean;
  onClose: () => void;
  /** Size tier */
  tier?: ModalTier;
  /** <ModalTitleBar /> */
  titleBar?: React.ReactNode;
  /** <NavRail /> — rendered to the left of the body */
  navRail?: React.ReactNode;
  /** <ActionDock /> — rendered as the footer */
  actionDock?: React.ReactNode;
  /** Scrollable body content */
  children?: React.ReactNode;
  bodyClassName?: string;
  /** Prevent closing via backdrop / Escape */
  static?: boolean;
}

const TIER_OUTER_CLASS: Record<ModalTier, string> = {
  toast:      "modal-shell-toast",
  panel:      "modal-shell-panel",
  fullscreen: "modal-shell-fullscreen",
};

/**
 * Pure-React portal modal shell — no Bootstrap.
 * Renders into document.body via ReactDOM.createPortal.
 * Supports Escape key and backdrop click to close (unless `static` is true).
 *
 * Layout:
 * ┌ OuterPanel ─────────────────────────────┐
 * │ [TitleBar]                              │
 * │ [NavRail] │ [Body (scrollable)]         │
 * │ [ActionDock]                            │
 * └─────────────────────────────────────────┘
 */
export const ModalShell: React.FC<Props> = ({
  show,
  onClose,
  tier = "panel",
  titleBar,
  navRail,
  actionDock,
  children,
  bodyClassName,
  static: isStatic,
}) => {
  const isFullscreen = tier === "fullscreen";

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isStatic && e.key === "Escape") onClose();
    },
    [isStatic, onClose],
  );

  useEffect(() => {
    if (!show) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [show, handleKeyDown]);

  // Lock body scroll while open
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [show]);

  if (!show) return null;
  if (typeof document === "undefined") return null;

  const handleBackdropClick = () => {
    if (!isStatic) onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className={clsx(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        isFullscreen && "p-0",
      )}
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={handleBackdropClick}
    >
      <div
        className={clsx(TIER_OUTER_CLASS[tier])}
        onClick={(e) => e.stopPropagation()}
      >
        <OuterPanel
          className={clsx(
            "flex flex-col gap-1 overflow-hidden",
            isFullscreen ? "w-full h-full" : "max-h-[82vh]",
          )}
          style={isFullscreen ? { borderRadius: 0 } : undefined}
        >
          {titleBar}

          <div className="flex flex-1 min-h-0 gap-1">
            {navRail}
            <div
              className={clsx(
                "flex-1 min-w-0 min-h-0 overflow-y-auto scrollable flex flex-col gap-1",
                bodyClassName,
              )}
            >
              {children}
            </div>
          </div>

          {actionDock}
        </OuterPanel>
      </div>
    </div>,
    document.body,
  );
};
