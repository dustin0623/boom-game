'use client';

import { activeChain }   from '@/lib/client/chain';
import { chainBranding } from '@/lib/config/branding';

const branding = chainBranding[activeChain];

// Robinhood Chain — EIP-6963 wallet discovery + EIP-712 personal_sign.
// Chain ID: 4663 (0x1237), EVM-compatible.

export const ROBINHOOD_CHAIN_ID_HEX = '0x1237';
export const ROBINHOOD_CHAIN_ID_DEC = 4663;
export const ROBINHOOD_CHAIN_NAME   = 'Robinhood Chain';
export const ROBINHOOD_RPC_URL      = 'https://rpc.mainnet.chain.robinhood.com/';
export const ROBINHOOD_EXPLORER_URL = 'https://robinhoodchain.blockscout.com';

export const SIGN_MESSAGE =
  `Sign this message to authenticate with ${branding.gameName}. This is free — no transaction is sent.`;

export class WrongChainError extends Error {
  readonly isWrongChain = true;
  constructor() { super('wrong-chain'); this.name = 'WrongChainError'; }
}

export interface EIP6963ProviderInfo {
  uuid:  string;
  name:  string;
  icon:  string;
  rdns:  string;
}

export interface EIP6963Provider {
  info: EIP6963ProviderInfo;
  provider: {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  };
}

export interface RobinhoodConnectResult {
  wallet:     string; // checksummed EVM address, lowercased
  walletName: string;
  signature:  string;
  message:    string;
}

async function assertRobinhoodChain(
  provider: EIP6963Provider['provider'],
): Promise<void> {
  const chainId = (await provider.request({ method: 'eth_chainId' })) as string;
  const normalise = (c: string) => '0x' + parseInt(c, 16).toString(16);
  if (normalise(chainId) !== normalise(ROBINHOOD_CHAIN_ID_HEX)) {
    throw new WrongChainError();
  }
}

/**
 * Discovers EIP-6963 injected wallets via window events (no React state).
 * Returns a cleanup function.
 */
export function subscribeToEIP6963Wallets(
  onChange: (wallets: EIP6963Provider[]) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const seen = new Set<string>();
  let current: EIP6963Provider[] = [];

  function handleAnnounce(event: Event) {
    const e = event as CustomEvent<EIP6963Provider>;
    if (!e.detail?.info?.rdns) return;
    if (seen.has(e.detail.info.rdns)) return;
    seen.add(e.detail.info.rdns);
    current = [...current, e.detail];
    onChange(current);
  }

  window.addEventListener('eip6963:announceProvider', handleAnnounce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  return () => window.removeEventListener('eip6963:announceProvider', handleAnnounce);
}

export async function connectAndSignRobinhood(
  selected: EIP6963Provider,
): Promise<RobinhoodConnectResult> {
  const { provider, info } = selected;

  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts?.length) throw new Error('No accounts returned from wallet.');

  const address = accounts[0];
  const message = SIGN_MESSAGE;

  await assertRobinhoodChain(provider);

  const msgHex = '0x' + Buffer.from(message, 'utf8').toString('hex');
  const signature = (await provider.request({
    method: 'personal_sign',
    params: [msgHex, address],
  })) as string;

  return {
    wallet:     address.toLowerCase(),
    walletName: info.name,
    signature,
    message,
  };
}
