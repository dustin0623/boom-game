import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { config } from "@/lib/config/config";
import {
  emailLoginFn,
  emailSignupFn,
  walletLogin,
  SOLANA_WALLETS,
  XRPL_WALLETS,
  type XrplQrPrompt,
} from "@/lib/chains/providers";
import { useAuthStore } from "@/features/stores/auth.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CHAIN_LABEL = { solana: "Solana wallet", hive: "Hive Keychain", xrpl: "XRPL wallet" } as const;

export function LoginPanel() {
  const { player, setPlayer, logout } = useAuthStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hiveUser, setHiveUser] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<XrplQrPrompt | null>(null);

  const run = async (fn: () => Promise<Parameters<typeof setPlayer>[0]>) => {
    setBusy(true);
    setError(null);
    try {
      setPlayer(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (player) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">Signed in as</p>
        <p className="text-2xl font-semibold text-foreground">{player.displayName}</p>
        {player.walletAddress && config.auth.chain && (
          <p className="text-xs text-muted-foreground">via {CHAIN_LABEL[config.auth.chain]}</p>
        )}
        <Button variant="outline" onClick={logout}>Log out</Button>
      </div>
    );
  }

  const chain = config.auth.chain;
  return (
    <div className="space-y-6">
      {config.auth.email && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fn = mode === "login" ? emailLoginFn : emailSignupFn;
            run(() => fn({ data: { email, password } }));
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "login" ? "Log in" : "Create account"}
          </Button>
          <button
            type="button"
            className="w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "No account? Sign up" : "Have an account? Log in"}
          </button>
        </form>
      )}

      {config.auth.email && chain && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />or<div className="h-px flex-1 bg-border" />
        </div>
      )}

      {chain === "solana" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Choose your wallet</p>
          <div className="grid grid-cols-2 gap-2">
            {SOLANA_WALLETS.map((w) => (
              <Button
                key={w.id}
                variant="secondary"
                disabled={busy}
                onClick={() => run(() => walletLogin("solana", { solanaWallet: w.id }))}
              >
                {w.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {chain === "xrpl" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Choose your wallet</p>
          <div className="grid grid-cols-3 gap-2">
            {XRPL_WALLETS.map((w) => (
              <Button
                key={w.id}
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  run(() => walletLogin("xrpl", { xrplWallet: w.id, onPrompt: setPrompt })).finally(() => setPrompt(null))
                }
              >
                {w.label}
              </Button>
            ))}
          </div>
          {prompt && (
            <div className="flex flex-col items-center gap-3 rounded-md border border-border p-4">
              <p className="text-sm text-muted-foreground">
                Scan with {prompt.wallet === "xaman" ? "Xaman" : "Joey Wallet"} to sign in
              </p>
              {prompt.qrImage ? (
                <img src={prompt.qrImage} alt="Sign-in QR code" className="h-48 w-48" />
              ) : prompt.qrValue ? (
                <div className="rounded bg-background p-2">
                  <QRCodeSVG value={prompt.qrValue} size={192} />
                </div>
              ) : null}
              <a href={prompt.deeplink} className="text-xs text-primary underline-offset-4 hover:underline">
                On your phone? Open the wallet
              </a>
            </div>
          )}
        </div>
      )}

      {chain === "hive" && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="hive">Hive username</Label>
            <Input id="hive" placeholder="username" value={hiveUser} onChange={(e) => setHiveUser(e.target.value)} />
          </div>
          <Button
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() => run(() => walletLogin(chain, { hiveUsername: hiveUser }))}
          >
            Sign in with {CHAIN_LABEL[chain]}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
