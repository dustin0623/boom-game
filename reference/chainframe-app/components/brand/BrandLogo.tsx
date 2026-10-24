import { cn } from "@/lib/utils";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src="/brand/chainframe-logo.png"
      alt="Chainframe"
      className={cn("h-6 w-auto object-contain", className)}
      draggable={false}
    />
  );
}
