import { useState, type ReactNode } from "react";
import { Loader2, QrCode, Smartphone } from "lucide-react";
import { walletLogin, type XrplQrPrompt } from "@/lib/chains/providers";
import { useAuthStore } from "@/features/stores/auth.store";
import { BrandLogo } from "@/components/brand/Brand";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** XRPL sign-in via Xaman: QR code on desktop, deep link on mobile. */
export function ConnectWalletModal({ children }: { children: ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<XrplQrPrompt | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    setPrompt(null);
    try {
      const { player, token } = await walletLogin("xrpl", { xrplWallet: "xaman", onPrompt: setPrompt });
      setSession(player, token);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
      setPrompt(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm border-border bg-card">
        <DialogHeader className="items-center text-center">
          <BrandLogo className="mb-2 h-10" />
          <DialogTitle>Connect with Xaman</DialogTitle>
          <DialogDescription>
            Sign in with your XRPL account. No private keys are ever requested.
          </DialogDescription>
        </DialogHeader>

        {prompt ? (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-xl border border-primary/30 bg-foreground p-3 shadow-[0_0_30px_-6px_var(--primary)]">
              {prompt.qrImage && <img src={prompt.qrImage} alt="Xaman sign-in QR code" className="size-52" />}
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Scan with Xaman and approve the sign-in
            </p>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href={prompt.deeplink}>
                <Smartphone className="size-4" /> Open Xaman on this phone
              </a>
            </Button>
          </div>
        ) : (
          <Button size="lg" className="w-full gap-2" disabled={busy} onClick={start}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
            {busy ? "Preparing QR…" : "Sign in with Xaman"}
          </Button>
        )}

        {error && <p className="text-center text-sm text-destructive">{error}</p>}
        <p className="text-center text-[11px] text-muted-foreground">
          Don't have Xaman?{" "}
          <a href="https://xaman.app" target="_blank" rel="noreferrer" className="text-primary hover:underline">
            Get the app
          </a>
        </p>
      </DialogContent>
    </Dialog>
  );
}
