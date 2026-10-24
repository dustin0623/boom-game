'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore, type BootstrapPayload } from '@/features/store/gameStore';
import {
  signInWithHiveKeychain,
  isHiveKeychainAvailable,
} from '@/lib/auth/wallet-adapters/hive';
import { LoginCard } from './LoginCard';

const gold      = '#facc15';
const cream     = '#f5e9c4';
const hairline  = 'rgba(245,233,196,0.15)';
const pixelFont = "'Press Start 2P', monospace";
const bodyFont  = "'VT323', monospace";
const red       = '#ef4444';

interface AuthResponse {
  success?: boolean;
  error?:   string;
  code?:    string;
  player?:  BootstrapPayload['player'];
  token?:   string;
}

export function LoginHive() {
  const router  = useRouter();
  const hydrate = useGameStore((s) => s.hydrate);

  const [username, setUsername] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const keychainAvailable = typeof window !== 'undefined' ? isHiveKeychainAvailable() : true;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) {
      setError('Enter your Hive username.');
      return;
    }
    if (!isHiveKeychainAvailable()) {
      setError('Hive Keychain extension not found. Install it from hive-keychain.com.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const result = await signInWithHiveKeychain(username.trim());

      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          wallet:    result.wallet,
          signature: result.signature,
          message:   result.message,
        }),
      });
      const data = await res.json() as AuthResponse;

      if (!res.ok && data.code === 'NOT_REGISTERED') {
        // Auto-register new players.
        const regRes  = await fetch('/api/auth/register', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            wallet:    result.wallet,
            signature: result.signature,
            message:   result.message,
          }),
        });
        const regData = await regRes.json() as AuthResponse;
        if (!regRes.ok) {
          setError(regData.error ?? 'Registration failed. Try again.');
          return;
        }
        if (regData.token) localStorage.setItem('bm_token', regData.token);
        if (regData.player) hydrate({ player: regData.player, heroes: [] });
        router.push('/game');
        return;
      }
      if (!res.ok) {
        setError(data.error ?? 'Authentication failed. Try again.');
        return;
      }
      if (data.token) localStorage.setItem('bm_token', data.token);
      if (data.player) hydrate({ player: data.player, heroes: [] });
      router.push('/game');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Keychain signing failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginCard chainLabel="Hive Blockchain" error={error}>

      {/* Keychain not installed warning */}
      {!keychainAvailable && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          marginBottom: 20,
        }}>
          <p style={{ fontFamily: bodyFont, fontSize: 18, color: red, margin: 0 }}>
            Hive Keychain extension is not installed.{' '}
            <a href="https://hive-keychain.com" target="_blank" rel="noreferrer" style={{ color: gold, textDecoration: 'underline' }}>
              Get it here.
            </a>
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <label style={{
          display: 'block',
          fontFamily: pixelFont, fontSize: 9,
          color: cream, opacity: 0.75,
          letterSpacing: 2, marginBottom: 10,
        }}>
          HIVE USERNAME
        </label>

        {/* @ prefix input */}
        <div style={{ display: 'flex', marginBottom: 10 }}>
          <span style={{
            padding: '14px 12px',
            background: 'rgba(250,204,21,0.1)',
            border: `1px solid ${hairline}`, borderRight: 'none',
            fontFamily: bodyFont, fontSize: 20, color: gold, flexShrink: 0,
          }}>
            @
          </span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, '').toLowerCase())}
            placeholder="youraccount"
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1, padding: '14px 16px',
              fontFamily: bodyFont, fontSize: 20,
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${hairline}`,
              color: cream, outline: 'none',
            }}
          />
        </div>

        <p style={{ fontFamily: bodyFont, fontSize: 17, color: cream, opacity: 0.55, margin: '0 0 20px' }}>
          Hive Keychain will prompt you to sign a message with your Posting key. No tokens are spent.
        </p>

        <button
          type="submit"
          disabled={loading || !keychainAvailable}
          style={{
            width: '100%', padding: '18px 24px',
            background: loading ? 'rgba(250,204,21,0.5)' : gold,
            color: '#000',
            border: '4px solid #000',
            boxShadow: loading ? 'none' : '6px 6px 0 #000',
            cursor: loading || !keychainAvailable ? 'not-allowed' : 'pointer',
            fontFamily: pixelFont, fontSize: 12, letterSpacing: 1,
          }}
        >
          {loading ? 'WAITING FOR KEYCHAIN...' : 'SIGN IN WITH HIVE'}
        </button>
      </form>

    </LoginCard>
  );
}
