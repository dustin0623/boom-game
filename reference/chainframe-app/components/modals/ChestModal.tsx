import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { EquipmentCard } from "@/components/cards/EquipmentCard";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Root as Dialog } from "@radix-ui/react-dialog";
import { CHESTS, RARITY_META } from "@/lib/config/constants/game";
import { cn } from "@/lib/utils";
import type { ChestKey, Equipment } from "@/features/types/game/types";

interface ChestModalProps {
  open: boolean;
  chest: ChestKey | null;
  reward: Equipment | null;
  onClose: () => void;
}

export function ChestModal({ open, chest, reward, onClose }: ChestModalProps) {
  const rarity = reward ? RARITY_META[reward.rarity] : null;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {reward
              ? "Loot secured"
              : `Opening ${chest ? CHESTS[chest].label : "chest"}…`}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-[220px]">
          <AnimatePresence mode="wait">
            {!reward ? (
              <motion.div
                key="spinner"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid place-items-center gap-4 py-10"
              >
                <motion.span
                  animate={{ rotate: 360, scale: [1, 1.12, 1] }}
                  transition={{
                    duration: 1.1,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="grid size-20 place-items-center rounded-2xl bg-primary/15 text-primary"
                >
                  <Sparkles className="size-8" />
                </motion.span>
                <p className="text-sm text-muted-foreground">
                  Cracking the firmware seal…
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="reward"
                initial={{ opacity: 0, scale: 0.9, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 240, damping: 20 }}
                className="space-y-4"
              >
                <p
                  className={cn(
                    "text-center text-sm font-semibold",
                    rarity?.textClass,
                  )}
                >
                  {rarity?.label} drop
                </p>
                <EquipmentCard item={reward} hideActions />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
