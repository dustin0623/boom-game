"use client";

/**
 * ShareStatsModal
 *
 * Shows a live preview of the shareable stats card and downloads the image.
 */

import { useRef, useState, useEffect, useLayoutEffect } from "react";
import { Download, ImageDown } from "lucide-react";
import { toPng } from "html-to-image";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Root as Dialog } from "@radix-ui/react-dialog";
import { ShareStatsCard } from "@/components/cards/ShareStatsCard";

interface ShareStatsModalProps {
  open: boolean;
  onClose: () => void;
  /** Props forwarded directly to ShareStatsCard */
  cardProps: {
    username: string;
    level: number;
    address: string;
    vault: number;
    capacity: number;
    fillPercent: number;
    perSecond: number;
    hashRate: number;
    hackPower: number;
    security: number;
    notoriety: number;
    avatarImage?: string;
    bannerImage?: string;
  };
}

/** Fetch a local asset path and return it as a base64 data URL. */
async function toDataUrl(path: string): Promise<string> {
  const res = await fetch(path);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Fixed intrinsic width of the ShareStatsCard DOM node, in px. */
const CARD_WIDTH = 600;

export function ShareStatsModal({
  open,
  onClose,
  cardProps,
}: ShareStatsModalProps) {
  // Radix mounts the Dialog's portal content in a render pass that can
  // happen after the `open` prop flips true, so a plain ref + effect keyed
  // on `open` can run before the DOM nodes exist and never fire again.
  // State-backed callback refs sidestep that: they fire the instant each
  // node actually attaches, regardless of Radix's internal render timing.
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [previewCardEl, setPreviewCardEl] = useState<HTMLDivElement | null>(
    null,
  );
  const setPreviewCardRef = (el: HTMLDivElement | null) => {
    previewRef.current = el;
    setPreviewCardEl(el);
  };
  const [previewContainerEl, setPreviewContainerEl] =
    useState<HTMLDivElement | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Card is rendered at a fixed 600px width so html-to-image captures a
  // consistent image. To preview it without overflowing the (much narrower,
  // especially on mobile) dialog, we measure the available container width
  // and the card's natural height, then scale the card down to fit exactly.
  const [scale, setScale] = useState(1);
  const [cardHeight, setCardHeight] = useState(0);

  // Resolved data URLs for cosmetic images — avoids cross-origin canvas tainting
  const [resolvedAvatar, setResolvedAvatar] = useState<string | undefined>();
  const [resolvedBanner, setResolvedBanner] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    if (cardProps.avatarImage) {
      toDataUrl(cardProps.avatarImage)
        .then(setResolvedAvatar)
        .catch(() => setResolvedAvatar(cardProps.avatarImage));
    }
    if (cardProps.bannerImage) {
      toDataUrl(cardProps.bannerImage)
        .then(setResolvedBanner)
        .catch(() => setResolvedBanner(cardProps.bannerImage));
    }
  }, [open, cardProps.avatarImage, cardProps.bannerImage]);

  // Track the available preview width so the card always scales to fit —
  // this is what keeps the modal from overflowing on narrow/mobile screens.
  useLayoutEffect(() => {
    if (!previewContainerEl) return;
    const update = () => {
      const width = previewContainerEl.clientWidth;
      if (width > 0) setScale(Math.min(width / CARD_WIDTH, 1));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(previewContainerEl);
    return () => ro.disconnect();
  }, [previewContainerEl]);

  // Track the card's natural (unscaled) height — CSS transforms don't
  // affect offsetHeight, so this stays accurate regardless of scale.
  useLayoutEffect(() => {
    if (!previewCardEl) return;
    const update = () => setCardHeight(previewCardEl.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(previewCardEl);
    return () => ro.disconnect();
  }, [previewCardEl, resolvedAvatar, resolvedBanner]);

  const handleDownload = async () => {
    if (!previewRef.current || !origin) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(previewRef.current, { pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `${cardProps.username}-chainframe-stats.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Stats image downloaded");
    } catch {
      toast.error("Failed to capture image");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageDown className="size-4 text-primary" />
            Share your stats
          </DialogTitle>
        </DialogHeader>

        {/*
          min-w-0 is required here: DialogContent is a CSS Grid container,
          and grid items default to min-width:auto, which floors their size
          at their content's min-content width. Without this override the
          whole dialog refuses to shrink below the preview card's natural
          width on narrow (mobile) viewports, causing the horizontal
          overflow/clipping seen there.
        */}
        <div className="min-w-0 space-y-5">
          {/* Card preview — scaled down to fit the modal */}
          <div className="min-w-0">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Preview
            </p>
            {/*
              The card always renders at a fixed 600px width so html-to-image
              captures a consistent image. To preview it without overflowing
              the dialog on any screen size (mobile in particular), we measure
              the container's actual available width and scale the card down
              to fit it exactly — see the useLayoutEffect hooks above.
            */}
            <div
              ref={setPreviewContainerEl}
              className="mx-auto w-full min-w-0 max-w-[440px]"
            >
              <div
                style={{
                  height: cardHeight ? cardHeight * scale : undefined,
                  overflow: "hidden",
                  borderRadius: 14,
                }}
              >
                <div
                  style={{
                    width: CARD_WIDTH,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                >
                  <ShareStatsCard
                    ref={setPreviewCardRef}
                    {...cardProps}
                    origin={origin}
                    avatarImage={resolvedAvatar}
                    bannerImage={resolvedBanner}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              className="flex-1"
              onClick={handleDownload}
              disabled={downloading || !origin}
            >
              <Download className="size-4" />
              {downloading ? "Saving…" : "Download image"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
