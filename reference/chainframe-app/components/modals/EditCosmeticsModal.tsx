"use client";
import { useWorkerStore } from "@/features/stores/workerStore";

import { useEffect, useState, useRef } from "react";
import { useAuthStore } from "@/features/stores/authStore";
import { Check, Lock, Loader2 } from "lucide-react";

import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Root as Dialog } from "@radix-ui/react-dialog";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Root as Tabs } from "@radix-ui/react-tabs";
import { Button } from "@/components/ui/button";
import {
  getTemplatesByKind,
  isCosmeticUnlocked,
  type CosmeticKind,
  type CosmeticTemplateEntry,
} from "@/features/types/game/templates";

import { notify } from "@/lib/notify";
import { submitSignedGameAction } from "@/features/events/frontend/broadcast-game-action/submit";
import { usePlayerStore } from "@/features/stores/playerStore";
import { levelProgress } from "@/features/types/game/level";
import { cn } from "@/lib/utils";

interface EditCosmeticsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KINDS = ["avatar", "banner", "background"] as const;

/**
 * Equips a cosmetic. Cosmetics have no DB presence — the server just
 * validates the templateId against the const catalog and the player's
 * level, then writes the numeric templateId onto the equipped*Id pointer.
 */
async function equipCosmetic(
  kind: CosmeticKind,
  templateId: number,
  onSubmitted?: () => void,
): Promise<boolean> {
  try {
    return (
      await submitSignedGameAction(
        "equip_cosmetic",
        { kind, templateId },
        onSubmitted,
      )
    ).ok;
  } catch {
    return false;
  }
}

export function EditCosmeticsModal({
  open,
  onOpenChange,
}: EditCosmeticsModalProps) {
  const workerAvailable = useWorkerStore((state) => state.available);
  const playerXp = usePlayerStore((state) => state.xp);
  const equippedAvatar = usePlayerStore((state) => state.avatar);
  const equippedBanner = usePlayerStore((state) => state.banner);
  const equippedBackground = usePlayerStore((state) => state.background);
  const currentLevel = Math.min(100, levelProgress(playerXp).level);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [tab, setTab] = useState<CosmeticKind>("avatar");
  const [selectedAvatar, setSelectedAvatar] = useState(equippedAvatar);
  const [selectedBanner, setSelectedBanner] = useState(equippedBanner);
  const [selectedBackground, setSelectedBackground] =
    useState(equippedBackground);

  useEffect(() => {
    if (!open) return;
    setSelectedAvatar(equippedAvatar);
    setSelectedBanner(equippedBanner);
    setSelectedBackground(equippedBackground);
  }, [open, equippedAvatar, equippedBanner, equippedBackground]);

  const selectedByKind: Record<CosmeticKind, number> = {
    avatar: selectedAvatar,
    banner: selectedBanner,
    background: selectedBackground,
  };
  const equippedByKind: Record<CosmeticKind, number> = {
    avatar: equippedAvatar,
    banner: equippedBanner,
    background: equippedBackground,
  };
  const setSelected: Record<CosmeticKind, (templateId: number) => void> = {
    avatar: setSelectedAvatar,
    banner: setSelectedBanner,
    background: setSelectedBackground,
  };

  async function handleSave() {
    const origin = useAuthStore.getState();
    const current = () => {
      const state = useAuthStore.getState();
      return (
        state.address === origin.address &&
        state.connectedAt === origin.connectedAt &&
        state.mode === origin.mode
      );
    };
    let submitted = false;
    setSaving(true);
    try {
      {
        for (const kind of KINDS) {
          if (!current()) return;
          if (
            selectedByKind[kind] !== equippedByKind[kind] &&
            !(await equipCosmetic(kind, selectedByKind[kind], () => {
              if (!submitted && mounted.current && current())
                onOpenChange(false);
              submitted = true;
            }))
          ) {
            if (!submitted && mounted.current && current())
              notify(
                "Cosmetic change was not confirmed. Check your transaction before retrying.",
                "danger",
              );
            return;
          }
        }
      }
      if (!submitted && mounted.current && current()) onOpenChange(false);
    } finally {
      if (mounted.current && current()) setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle className="text-base font-semibold">
            Edit profile cosmetics
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Cosmetics unlock automatically as you reach new player levels.
          </p>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as CosmeticKind)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="mx-6 mt-4 shrink-0 justify-start gap-1 rounded-lg bg-secondary/50 p-1">
            {KINDS.map((kind) => (
              <TabsTrigger
                key={kind}
                value={kind}
                className="text-xs font-medium"
              >
                {kind[0].toUpperCase() + kind.slice(1)} (
                {getTemplatesByKind(kind).length})
              </TabsTrigger>
            ))}
          </TabsList>

          {KINDS.map((kind) => (
            <TabsContent
              key={kind}
              value={kind}
              className="mt-0 min-h-0 flex-1 overflow-y-auto px-6 py-4"
            >
              <div
                className={cn(
                  "grid gap-3",
                  kind === "avatar"
                    ? "grid-cols-4 sm:grid-cols-6"
                    : "grid-cols-2 sm:grid-cols-3",
                )}
              >
                {getTemplatesByKind(kind).map((template) => {
                  const unlocked = isCosmeticUnlocked(
                    currentLevel,
                    template.templateId,
                  );
                  const selected = selectedByKind[kind] === template.templateId;
                  return (
                    <CosmeticOption
                      key={template.templateId}
                      template={template}
                      kind={kind}
                      unlocked={unlocked}
                      selected={selected}
                      onSelect={() => {
                        if (!unlocked) return;
                        setSelected[kind](template.templateId);
                      }}
                    />
                  );
                })}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="shrink-0 border-t border-border/60 px-6 py-4">
          <Button
            onClick={handleSave}
            disabled={saving || workerAvailable !== true}
            className="w-full"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CosmeticOption({
  template,
  kind,
  unlocked,
  selected,
  onSelect,
}: {
  template: CosmeticTemplateEntry;
  kind: CosmeticKind;
  unlocked: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const imageClass =
    kind === "avatar"
      ? "aspect-square rounded-full"
      : "aspect-[3/1] rounded-lg";
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!unlocked}
      className={cn(
        "group relative overflow-hidden rounded-xl text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        selected ? "ring-2 ring-primary" : "ring-1 ring-border/50",
        !unlocked && "cursor-not-allowed opacity-60",
      )}
      aria-label={`${template.name}, ${unlocked ? "unlocked" : `unlocks at level ${template.requiredLevel}`}`}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden bg-secondary",
          imageClass,
        )}
      >
        <img
          src={template.image}
          alt={template.name}
          className={cn("size-full object-cover", !unlocked && "grayscale")}
        />
        <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-background/85 px-1.5 py-1 text-[9px] font-semibold">
          {unlocked ? (
            <Check className="size-3 text-success" />
          ) : (
            <Lock className="size-3" />
          )}
          {unlocked ? "Unlocked" : `Level ${template.requiredLevel}`}
        </span>
        {selected ? (
          <span className="absolute inset-0 grid place-items-center bg-primary/25">
            <Check className="size-6 text-white drop-shadow" />
          </span>
        ) : null}
      </div>
      <div className="p-2">
        <p className="truncate text-[10px] font-medium">{template.name}</p>
        <p className="text-[9px] text-muted-foreground">
          {unlocked
            ? "Available to equip"
            : `Unlocks at level ${template.requiredLevel}`}
        </p>
      </div>
    </button>
  );
}
