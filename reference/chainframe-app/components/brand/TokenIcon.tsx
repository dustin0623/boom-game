import { cn } from "@/lib/utils";

export function TokenIcon({ className }: { className?: string }) {
  return (
    <img
      src="/brand/hash-token.png"
      alt="$HASH token"
      className={cn("size-5 object-contain", className)}
      draggable={false}
      loading="lazy"
    />
  );
}
