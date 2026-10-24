import { useState } from "react";
import { Users } from "lucide-react";
import { HeroCard } from "@/components/game/HeroCard";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useGameStore, type RosterHero } from "@/features/stores/game.store";
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
    <HeroCard
      hero={hero}
      footer={
        <Button
          size="sm"
          className="w-full"
          variant={hero.onMap ? "outline" : "default"}
          disabled={!hero.onMap && !deployable}
          onClick={() => sendCommand({ type: hero.onMap ? "recall" : "deploy", heroId: hero.id })}
        >
          {label}
        </Button>
      }
    >
      <div>
        <div className="flex items-center justify-between text-[10px]">
          <span className={cn("font-semibold uppercase", st.className)}>{st.label}</span>
          <span className="font-mono text-muted-foreground">
            {Math.floor(hero.energy)}/{hero.maxEnergy} energy
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
          <div
            className={cn("h-full transition-all", pct <= 20 ? "bg-destructive" : pct <= 50 ? "bg-warning" : "bg-success")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </HeroCard>
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
        <div className="mt-4 space-y-3">
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
