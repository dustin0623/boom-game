import { useState, type ReactNode } from "react";
import { BookOpen, Check, Copy, ExternalLink, Info, Send, Settings, User, Users, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/stores/auth.store";
import { useSettingsStore } from "@/features/stores/settings.store";

/** Fill these in once the real accounts exist; empty = shown disabled. */
export const SOCIAL_LINKS = {
  x: "",
  telegram: "",
  docs: "",
};

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const LINKS = [
  { label: "X", value: "Follow announcements", href: SOCIAL_LINKS.x, icon: XIcon },
  { label: "Telegram", value: "Join the community", href: SOCIAL_LINKS.telegram, icon: Send },
  { label: "Documentation", value: "Read the guide", href: SOCIAL_LINKS.docs, icon: BookOpen },
];

function Header({ icon: Icon, title, desc }: { icon: typeof Info; title: string; desc?: string }) {
  return (
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-primary/15 text-primary">
          <Icon className="size-4" />
        </span>
        {title}
      </DialogTitle>
      {desc && <DialogDescription>{desc}</DialogDescription>}
    </DialogHeader>
  );
}

export function AboutModal({ children }: { children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <Header icon={Info} title="About" desc="An idle bomber mining game on XRPL. Follow us and read the docs to get started." />
        <div className="space-y-2">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href || undefined}
              target={l.href ? "_blank" : undefined}
              rel={l.href ? "noopener noreferrer" : undefined}
              aria-disabled={!l.href || undefined}
              className="flex min-h-11 items-center gap-3 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5 aria-disabled:pointer-events-none aria-disabled:opacity-60"
            >
              <l.icon className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground">{l.label}</p>
                <p className="truncate text-[11px] text-muted-foreground">{l.href ? l.value : "Coming soon"}</p>
              </div>
              {l.href && <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />}
            </a>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Controlled = { open: boolean; onOpenChange: (o: boolean) => void };

export function ProfileModal({ open, onOpenChange }: Controlled) {
  const player = useAuthStore((s) => s.player);
  const address = player?.walletAddress ?? player?.username ?? "";
  const name = player?.displayName || player?.username || "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <Header icon={User} title="Profile" />
        <div className="space-y-2 text-sm">
          <Row label="Name" value={name} />
          <Row label="Wallet" value={address} mono />
          <Row label="Network" value="XRPL · Xaman" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={mono ? "break-all font-mono text-[12px]" : "text-[13px] font-medium"}>{value}</p>
    </div>
  );
}

export function ReferralModal({ open, onOpenChange }: Controlled) {
  const player = useAuthStore((s) => s.player);
  const [copied, setCopied] = useState(false);
  const code = player?.walletAddress ?? player?.username ?? "";
  const link = typeof window !== "undefined" ? `${window.location.origin}/?ref=${encodeURIComponent(code)}` : "";
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Referral link copied");
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <Header icon={Users} title="Referral" desc="Share your link with friends. Referral rewards are coming soon." />
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 p-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{link}</span>
          <Button size="sm" variant="outline" onClick={copy} className="gap-1">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsModal({ open, onOpenChange }: Controlled) {
  const { soundOn, bombVolume, setSoundOn, setBombVolume } = useSettingsStore();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <Header icon={Settings} title="Settings" desc="Sound & effects. Saved on this device." />
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/60 px-3 py-3">
            <span className="flex items-center gap-2 text-[13px] font-medium">
              {soundOn ? <Volume2 className="size-4 text-primary" /> : <VolumeX className="size-4 text-muted-foreground" />}
              Sounds
            </span>
            <Switch checked={soundOn} onCheckedChange={setSoundOn} aria-label="Sounds" />
          </div>
          <div className="space-y-3 rounded-lg border border-border/60 bg-card/60 px-3 py-3" aria-disabled={!soundOn || undefined}>
            <div className="flex items-center justify-between text-[13px] font-medium">
              <span>Bomb volume</span>
              <span className="font-mono text-[12px] text-muted-foreground">{bombVolume}%</span>
            </div>
            <Slider
              value={[bombVolume]}
              min={0}
              max={100}
              step={5}
              disabled={!soundOn}
              onValueChange={([v]) => setBombVolume(v ?? 0)}
              aria-label="Bomb volume"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
