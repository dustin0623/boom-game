import { createServerFn } from "@tanstack/react-start";
import {
  ChallengeRequestSchema,
  EmailCredentialsSchema,
  WalletLoginSchema,
  XamanStartSchema,
  XamanStatusSchema,
} from "@/features/types/auth.types";

export const emailLoginFn = createServerFn({ method: "POST" })
  .inputValidator((d) => EmailCredentialsSchema.parse(d))
  .handler(async ({ data }) => {
    const { loginWithEmail } = await import("./email/login");
    return loginWithEmail(data);
  });

export const emailSignupFn = createServerFn({ method: "POST" })
  .inputValidator((d) => EmailCredentialsSchema.parse(d))
  .handler(async ({ data }) => {
    const { signupWithEmail } = await import("./email/signup");
    return signupWithEmail(data);
  });

export const walletChallengeFn = createServerFn({ method: "POST" })
  .inputValidator((d) => ChallengeRequestSchema.parse(d))
  .handler(async ({ data }) => {
    const { createChallenge } = await import("./challenge.server");
    return createChallenge(data.chain, data.address);
  });

export const walletLoginFn = createServerFn({ method: "POST" })
  .inputValidator((d) => WalletLoginSchema.parse(d))
  .handler(async ({ data }) => {
    const { loginWithWallet } = await import("./wallet-login");
    return loginWithWallet(data);
  });

export const xamanStartFn = createServerFn({ method: "POST" })
  .inputValidator((d) => XamanStartSchema.parse(d))
  .handler(async ({ data }) => {
    const { createXamanSignIn } = await import("@/lib/chains/modules/xrpl/server/events/login/action");
    return createXamanSignIn(data.message, data.token);
  });

export const xamanStatusFn = createServerFn({ method: "POST" })
  .inputValidator((d) => XamanStatusSchema.parse(d))
  .handler(async ({ data }) => {
    const { getXamanStatus } = await import("@/lib/chains/modules/xrpl/server/events/login/action");
    return getXamanStatus(data.uuid);
  });
