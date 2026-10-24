import { Wallet } from "lucide-react";
import { ConnectWalletModal } from "@/components/auth/ConnectWalletModal";
import { BrandLogo } from "@/components/brand/Brand";
import { Button } from "@/components/ui/button";

export function ConnectGate() {
  return (
    <div className="grid min-h-[70vh] place-items-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <BrandLogo className="mx-auto h-28" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Enter the mine</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect your XRPL account with Xaman to start mining, open chests and raid other rigs.
        </p>
        <ConnectWalletModal>
          <Button size="lg" className="mt-6 gap-2">
            <Wallet className="size-4" />
            Connect wallet
          </Button>
        </ConnectWalletModal>
      </div>
    </div>
  );
}
