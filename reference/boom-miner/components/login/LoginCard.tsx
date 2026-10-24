'use client';

import type { CSSProperties, ReactNode } from 'react';
import { activeChain }   from '@/lib/client/chain';
import { chainBranding } from '@/lib/config/branding';

const branding = chainBranding[activeChain];

const pixelFont = "'Press Start 2P', monospace";
const bodyFont  = "'VT323', monospace";
const gold      = '#facc15';
const cream     = '#f5e9c4';
const hairline  = 'rgba(245,233,196,0.15)';
const red       = '#ef4444';

interface LoginCardProps {
  chainLabel: string;
  error:      string;
  children:   ReactNode;
}

const chip: CSSProperties = {
  display: 'inline-block', fontFamily: pixelFont, fontSize: 9,
  color: gold, border: `1px solid ${gold}`, padding: '4px 8px',
  letterSpacing: 2,
};

export function LoginCard({ chainLabel, error, children }: LoginCardProps) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: `2px solid ${hairline}`,
      padding: 40,
      boxShadow: '10px 10px 0 #000',
    }}>
      {/* Brand logo — centred above the LOGIN header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <img
          src={branding.logo}
          alt={branding.gameName}
          style={{ height: 112, width: 'auto', imageRendering: 'pixelated', display: 'inline-block' }}
        />
      </div>

      {/* Separator */}
      <div style={{ borderBottom: `1px dashed ${hairline}`, marginBottom: 20 }} />

      {/* Chain badge */}
      <div style={{ marginTop: 18, marginBottom: 24 }}>
        <span style={chip}>{chainLabel.toUpperCase()}</span>
      </div>

      {/* Slot for chain-specific UI */}
      {children}

      {/* Error */}
      {error && (
        <p style={{ fontFamily: bodyFont, fontSize: 18, color: red, marginTop: 14, lineHeight: 1.4 }}>
          {error}
        </p>
      )}
    </div>
  );
}
