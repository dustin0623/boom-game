import { useState } from "react";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/features/stores/auth.store";

export function LoginDialog() {
  const [open, setOpen] = useState(false);
  const player = useAuthStore((s) => s.player);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">{player ? "Account" : "Login"}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{player ? "Your account" : "Enter the Game"}</DialogTitle>
          <DialogDescription>
            {player ? "You are signed in." : "Sign in with email or your wallet."}
          </DialogDescription>
        </DialogHeader>
        <LoginPanel />
      </DialogContent>
    </Dialog>
  );
}
