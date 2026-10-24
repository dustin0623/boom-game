import React from "react";
import { clsx } from "clsx";
import { InnerPanel } from "@/components/ui/Panel";

interface Props {
  icon?: string;
  value: React.ReactNode;
  caption: string;
  className?: string;
}

/**
 * Icon + value + caption InnerPanel block.
 * Used for coin balances, on-map counts, connection status chips, etc.
 */
export const StatChip: React.FC<Props> = ({ icon, value, caption, className }) => (
  <InnerPanel className={clsx("flex items-center gap-2 px-2 py-1.5 min-w-0", className)}>
    {icon && (
      <img src={icon} alt="" className="w-6 h-6 object-contain pixelated shrink-0" />
    )}
    <div className="flex flex-col min-w-0">
      <span className="text-xs sm:text-sm text-white text-shadow leading-tight truncate">
        {value}
      </span>
      <span className="text-[9px] text-white/60 leading-tight uppercase tracking-wide truncate">
        {caption}
      </span>
    </div>
  </InnerPanel>
);
