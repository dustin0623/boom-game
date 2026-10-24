import { z } from "zod";

export const ChainProviderSchema = z.enum(["solana", "hive", "xrpl"]);
export const AuthProviderSchema = z.enum(["email", "solana", "hive", "xrpl"]);

/** Public player identity (safe to send to the browser). Chain comes from config.auth.chain. */
export const PlayerSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3).max(32),
  displayName: z.string().min(1).max(50),
  /** Wallet on the configured chain; null for email-only accounts. */
  walletAddress: z.string().nullable(),
  /** Lowercased; null until linked in account settings. */
  email: z.string().email().nullable(),
  isEmailVerified: z.boolean().default(false),
  avatarUrl: z.string().url().nullable().default(null),
  lastLoginAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Player = z.infer<typeof PlayerSchema>;

export const EmailCredentialsSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
});
export type EmailCredentials = z.infer<typeof EmailCredentialsSchema>;

export const ChallengeRequestSchema = z.object({
  chain: ChainProviderSchema,
  address: z.string().min(1).max(128),
});

export const ChallengeSchema = z.object({
  message: z.string(),
  token: z.string(),
});
export type Challenge = z.infer<typeof ChallengeSchema>;

export const WalletLoginSchema = z.object({
  chain: ChainProviderSchema,
  address: z.string().min(1).max(128),
  message: z.string().max(1000),
  token: z.string().max(2000),
  /** Signature, signed tx blob (Joey) or Xaman request uuid. */
  signature: z.string().min(1).max(4000),
  /** Required for GemWallet (address is derived from it). */
  publicKey: z.string().max(200).optional(),
  xrplWallet: z.enum(["xaman", "joey", "gemwallet"]).optional(),
});
export type WalletLogin = z.infer<typeof WalletLoginSchema>;

export const XamanStartSchema = z.object({ message: z.string().max(1000), token: z.string().max(2000) });
export const XamanStatusSchema = z.object({ uuid: z.string().uuid() });
