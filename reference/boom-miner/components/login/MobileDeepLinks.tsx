'use client';

/**
 * MobileDeepLinks
 *
 * Shown on mobile browsers when no injected wallet is detected.
 * Renders deep-link / universal-link buttons that open the game URL
 * inside the chosen wallet's in-app browser, where the extension
 * IS available for signing.
 *
 * Robinhood (EVM)  — MetaMask, Coinbase Wallet
 * Solana           — Phantom, Solflare, Backpack
 */

const gold      = '#facc15';
const cream     = '#f5e9c4';
const pixelFont = "'Press Start 2P', monospace";
const bodyFont  = "'VT323', monospace";

interface DeepLinkEntry {
  name:    string;
  icon:    string; // data-URI or absolute URL
  buildUrl: (appUrl: string) => string;
}

const ROBINHOOD_LINKS: DeepLinkEntry[] = [
  {
    name:    'MetaMask',
    icon:    'https://raw.githubusercontent.com/MetaMask/brand-resources/master/SVG/SVG_MetaMask_Icon_Color.svg',
    buildUrl: (u) => `https://metamask.app.link/dapp/${u.replace(/^https?:\/\//, '')}`,
  },
  {
    name:    'Coinbase Wallet',
    icon:    'https://raw.githubusercontent.com/coinbase/coinbase-wallet-sdk/main/packages/wallet-sdk/assets/coinbase-wallet-logo.png',
    buildUrl: (u) => `https://go.cb-wallet.io/dapp?url=${encodeURIComponent(u)}`,
  },
];

const SOLANA_LINKS: DeepLinkEntry[] = [
  {
    name:    'Phantom',
    icon:    'https://raw.githubusercontent.com/phantom-labs/press-kit/main/Phantom_SVG_Icon.svg',
    buildUrl: (u) => `https://phantom.app/ul/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(u)}`,
  },
  {
    name:    'Solflare',
    icon:    'https://solflare.com/assets/logo.svg',
    buildUrl: (u) => `https://solflare.com/ul/v1/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(u)}`,
  },
  {
    name:    'Backpack',
    icon:    'https://backpack.app/favicon.ico',
    buildUrl: (u) => `https://backpack.app/browse/${encodeURIComponent(u)}`,
  },
];

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function MobileDeepLinksRobinhood() {
  if (!isMobileBrowser()) return null;
  return <DeepLinkList entries={ROBINHOOD_LINKS} chain="Robinhood Chain" />;
}

export function MobileDeepLinksSolana() {
  if (!isMobileBrowser()) return null;
  return <DeepLinkList entries={SOLANA_LINKS} chain="Solana" />;
}

function DeepLinkList({ entries, chain }: { entries: DeepLinkEntry[]; chain: string }) {
  const appUrl =
    typeof window !== 'undefined'
      ? window.location.href
      : (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://boom-miner.app');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
      <p style={{
        fontFamily: bodyFont,
        fontSize:   18,
        color:      cream,
        opacity:    0.6,
        margin:     0,
        textAlign:  'center',
        lineHeight: 1.4,
      }}>
        Open inside a wallet browser to connect:
      </p>

      {entries.map((entry) => {
        const href = entry.buildUrl(appUrl);
        return (
          <a
            key={entry.name}
            href={href}
            target="_blank"
            rel="noreferrer"
            style={{
              display:        'flex',
              alignItems:     'center',
              gap:            12,
              width:          '100%',
              padding:        '12px 16px',
              textDecoration: 'none',
              background:     'rgba(255,255,255,0.04)',
              border:         '1px solid rgba(245,233,196,0.2)',
              boxSizing:      'border-box',
            }}
          >
            <img
              src={entry.icon}
              alt=""
              style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0, objectFit: 'contain' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: pixelFont, fontSize: 10, color: cream, letterSpacing: 1 }}>
                {entry.name}
              </div>
              <div style={{ fontFamily: bodyFont, fontSize: 14, color: cream, opacity: 0.5, marginTop: 2 }}>
                {chain}
              </div>
            </div>
            <span style={{ fontFamily: pixelFont, fontSize: 8, color: gold, letterSpacing: 1, flexShrink: 0 }}>
              OPEN →
            </span>
          </a>
        );
      })}

      <p style={{
        fontFamily: pixelFont,
        fontSize:   7,
        color:      cream,
        opacity:    0.35,
        margin:     '4px 0 0',
        textAlign:  'center',
        lineHeight: 1.8,
        letterSpacing: 0.5,
      }}>
        You will be redirected to the wallet app.{'\n'}
        The game opens inside the wallet browser where signing works.
      </p>
    </div>
  );
}
