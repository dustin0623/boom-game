import React from "react";
import { clsx } from "clsx";

interface Props {
  icon?: string;
  className?: string;
  children?: React.ReactNode;
}

/** Small gold chip label for content section headings inside a modal body. */
export const SectionLabel: React.FC<Props> = ({ icon, className, children }) => (
  <span
    className={clsx(
      "inline-flex items-center gap-1.5 px-2 py-1 rounded",
      "bg-[#3a2410] text-yellow-400 border border-yellow-900",
      "text-[9px] uppercase tracking-wide leading-none",
      className,
    )}
    style={{ fontFamily: "var(--font-press-start, 'Press Start 2P', monospace)" }}
  >
    {icon && (
      <img src={icon} alt="" className="w-3.5 h-3.5 object-contain pixelated" />
    )}
    {children}
  </span>
);
