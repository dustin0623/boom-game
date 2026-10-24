'use client';

import { getWallets } from '@wallet-standard/app';
import type { Wallet } from '@wallet-standard/base';
import { activeChain }   from '@/lib/client/chain';
import { chainBranding } from '@/lib/config/branding';

const branding = chainBranding[activeChain];

export interface DetectedWallet {
  name: string;
  icon: string;
  wallet: Wallet;
}

export interface SolanaConnectResult {
  wallet: string;   // base58 public key (lowercase)
  signature: string; // bs58-encoded bytes
  message: string;
}

const SOLANA_CHAIN_PREFIX = 'solana:';

function isSolanaSignInCapable(w: Wallet): boolean {
  const supportsSolana = w.chains.some((c) => c.startsWith(SOLANA_CHAIN_PREFIX));
  const f = w.features as Record<string, unknown>;
  // Accept wallets that can sign messages (login) OR sign+send transactions
  // (deposit/mint). Both flows rely on standard:connect.
  return (
    supportsSolana &&
    'standard:connect' in f &&
    ('solana:signMessage' in f || 'solana:signAndSendTransaction' in f)
  );
}

/**
 * Subscribe to Wallet Standard Solana wallets. Returns unsubscribe fn.
 */
export function subscribeToSolanaWallets(
  onChange: (wallets: DetectedWallet[]) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const api = getWallets();

  const emit = () => {
    const list = api
      .get()
      .filter(isSolanaSignInCapable)
      .map((w) => ({ name: w.name, icon: w.icon, wallet: w }));
    onChange(list);
  };

  emit();
  const offRegister   = api.on('register',   emit);
  const offUnregister = api.on('unregister', emit);
  return () => { offRegister(); offUnregister(); };
}

function buildSignInMessage(address: string, nonce: string): string {
  const domain = typeof window !== 'undefined' ? window.location.host : (process.env.NEXT_PUBLIC_BASE_URL?.replace(/^https?:\/\//, '') ?? 'boom-miner.app');
  return [
    `${branding.gameName} — Sign In With Solana`,
    '',
    `Domain: ${domain}`,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date().toISOString()}`,
    '',
    'Signing proves ownership. No transaction is sent and no tokens are spent.',
  ].join('\n');
}

interface ConnectFeature {
  connect: (input?: { silent?: boolean }) => Promise<{
    accounts: ReadonlyArray<{ address: string; publicKey: Uint8Array }>;
  }>;
}
interface SignMessageFeature {
  signMessage: (...inputs: ReadonlyArray<{
    account: { address: string; publicKey: Uint8Array };
    message: Uint8Array;
  }>) => Promise<ReadonlyArray<{ signature: Uint8Array }>>;
}
interface DisconnectFeature { disconnect: () => Promise<void>; }

export async function signInWithSolanaWallet(w: Wallet): Promise<SolanaConnectResult> {
  const features = w.features as Record<string, unknown>;
  const connect     = features['standard:connect']   as ConnectFeature | undefined;
  const signMessage = features['solana:signMessage'] as SignMessageFeature | undefined;
  if (!connect)     throw new Error(`${w.name} does not support connect.`);
  if (!signMessage) throw new Error(`${w.name} does not support message signing.`);

  const connectResult = await connect.connect();
  const account = (connectResult.accounts[0] ?? w.accounts[0]) as
    | { address: string; publicKey: Uint8Array }
    | undefined;
  if (!account) throw new Error(`${w.name} did not return an account.`);

  const address = account.address;
  const nonce   = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const message = buildSignInMessage(address, nonce);
  const encoded = new TextEncoder().encode(message);
  const [result] = await signMessage.signMessage({ account, message: encoded });
  if (!result?.signature) throw new Error(`${w.name} did not return a signature.`);

  // bs58 encode — import dynamically to keep client bundle lean
  const { default: bs58 } = await import('bs58');

  const disconnect = features['standard:disconnect'] as DisconnectFeature | undefined;
  try { await disconnect?.disconnect(); } catch { /* ignore */ }

  return {
    wallet:    address,
    signature: bs58.encode(result.signature),
    message,
  };
}
