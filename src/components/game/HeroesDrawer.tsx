import { useState } from "react";
import { Users } from "lucide-react";
import { HeroSprite } from "@/components/game/HeroSprite";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useGameStore, type RosterHero } from "@/features/stores/game.store";
import { HERO_SPRITES, type HeroType } from "@/game/data/HeroRarity";
import { MAX_ON_MAP, canDeployEnergy } from "@/lib/config/constants/game";
import { cn } from "@/lib/utils";

const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

function status(h: RosterHero) {
  if (h.onMap) return { label: "Working", className: "text-success" };
  if (h.energy < 1) return { label: "Sleeping", className: "text-destructive" };
  if (!canDeployEnergy(h.energy, h.maxEnergy)) return { label: "Resting", className: "text-primary" };
  return { label: "Ready", className: "text-warning" };
}

function HeroRow({ hero, onMapCount }: { hero: RosterHero; onMapCount: number }) {
  const sendCommand = useGameStore((s) => s.sendCommand);
  const st = status(hero);
  const pct = hero.maxEnergy > 0 ? Math.round((hero.energy / hero.maxEnergy) * 100) : 0;
  const deployable = canDeployEnergy(hero.energy, hero.maxEnergy) && onMapCount < MAX_ON_MAP;
  const label = hero.onMap
    ? "Recall"
    : hero.energy < 1
      ? "Sleeping"
      : onMapCount >= MAX_ON_MAP
        ? "Map full"
        : !canDeployEnergy(hero.energy, hero.maxEnergy)
          ? "Needs 50%"
          : "Deploy";
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3">
      <HeroSprite sprite={HERO_SPRITES[hero.type as HeroType] ?? "ricky"} scale={2} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{hero.name}</p>
          <span className={cn("text-[10px] font-semibold uppercase", st.className)}>{st.label}</span>
        </div>
        <p className="text-[11px] capitalize text-muted-foreground">
          {hero.rarity} · POW {hero.power} · SPD {hero.speed}
        </p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-muted">
          <div
            className={cn("h-full transition-all", pct <= 20 ? "bg-destructive" : pct <= 50 ? "bg-warning" : "bg-success")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {Math.floor(hero.energy)}/{hero.maxEnergy} energy
        </p>
      </div>
      <Button
        size="sm"
        variant={hero.onMap ? "outline" : "default"}
        disabled={!hero.onMap && !deployable}
        onClick={() => sendCommand({ type: hero.onMap ? "recall" : "deploy", heroId: hero.id })}
      >
        {label}
      </Button>
    </div>
  );
}

/** Right-side drawer for sending heroes onto the map or calling them back to rest. */
export function HeroesDrawer() {
  const [open, setOpen] = useState(false);
  const roster = useGameStore((s) => s.roster);
  const deployError = useGameStore((s) => s.deployError);
  const sendCommand = useGameStore((s) => s.sendCommand);
  const onMapCount = roster.filter((h) => h.onMap).length;
  const sorted = [...roster].sort(
    (a, b) =>
      Number(b.onMap) - Number(a.onMap) || RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity),
  );
  const ready = roster.filter((h) => !h.onMap && canDeployEnergy(h.energy, h.maxEnergy));

  const deployAll = () => {
    let slots = MAX_ON_MAP - onMapCount;
    for (const h of ready) {
      if (slots-- <= 0) break;
      sendCommand({ type: "deploy", heroId: h.id });
    }
  };
  const recallAll = () => roster.filter((h) => h.onMap).forEach((h) => sendCommand({ type: "recall", heroId: h.id }));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Users className="size-4" /> Heroes {onMapCount}/{MAX_ON_MAP}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Heroes</SheetTitle>
          <SheetDescription>
            {onMapCount} / {MAX_ON_MAP} on the map. Resting heroes recharge energy and can deploy at 50%.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex gap-2">
          <Button size="sm" className="flex-1" disabled={!ready.length || onMapCount >= MAX_ON_MAP} onClick={deployAll}>
            Deploy all ready
          </Button>
          <Button size="sm" variant="outline" className="flex-1" disabled={!onMapCount} onClick={recallAll}>
            Recall all
          </Button>
        </div>
        {deployError && <p className="mt-3 text-xs text-destructive">{deployError}</p>}
        <div className="mt-4 space-y-2">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No heroes yet — mint some in the Shop.</p>
          ) : (
            sorted.map((h) => <HeroRow key={h.id} hero={h} onMapCount={onMapCount} />)
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
