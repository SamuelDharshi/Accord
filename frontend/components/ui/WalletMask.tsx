'use client';

/**
 * WalletMask — Always shows user identity, never raw hex addresses.
 * Displays Google avatar initial or "Connect" button.
 * Wraps @mysten/dapp-kit's useCurrentAccount hook.
 */

import { useState } from 'react';
import { useCurrentAccount, useDisconnectWallet, ConnectModal } from '@mysten/dapp-kit';
import { motion, AnimatePresence } from 'framer-motion';
import { initiateGoogleLogin, getZkLoginSession, clearZkLoginSession } from '@/lib/zklogin';

export function WalletMask() {
  const account = useCurrentAccount();
  const zkSession = typeof window !== 'undefined' ? getZkLoginSession() : null;
  const { mutate: disconnect } = useDisconnectWallet();
  const [showMenu, setShowMenu] = useState(false);
  const [isMinting, setIsMinting] = useState(false);

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
  const zkLoginReady = googleClientId.length > 0;

  const handleRequestFaucet = async () => {
    const userAddress = zkSession ? zkSession.address : account?.address;
    if (!userAddress) return;
    setIsMinting(true);
    try {
      const agentUrl = process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://localhost:3001';
      const res = await fetch(`${agentUrl}/faucet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: userAddress }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      alert(`Successfully requested $${data.amount} USDsui faucet to your wallet!`);
      setShowMenu(false);
      window.location.reload();
    } catch (err) {
      console.error('Faucet request failed:', err);
      alert(`Faucet request failed: ${(err as Error).message}`);
    } finally {
      setIsMinting(false);
    }
  };

  const isConnected = account || zkSession;

  // Derive display name: prefer zkLogin Google name, fall back to shortened address.
  const displayName = zkSession
    ? 'Connected'
    : account
    ? `${account.address.slice(0, 4)}…`
    : null;

  // Avatar initial — use first char of display name or a generic icon.
  const avatarChar = displayName ? displayName.charAt(0).toUpperCase() : '?';

  if (!isConnected) {
    return (
      <div className="inline-flex items-center gap-2 flex-wrap">
        <ConnectModal
          trigger={
            <button className="btn-primary text-xs flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12h-4" />
              </svg>
              Connect Wallet
            </button>
          }
        />
        {zkLoginReady && (
          <>
            <span className="text-text-tertiary text-xs px-1">or</span>
            <button
              id="connect-google"
              onClick={initiateGoogleLogin}
              className="btn-ghost text-xs flex items-center gap-2"
              title="Sign in with Google"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              zkLogin
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        id="wallet-menu"
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-bg-border bg-bg-elevated hover:border-accord-blue/40 transition-all duration-200"
      >
        {/* Avatar */}
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #4F8EF7, #8B5CF6)' }}
        >
          {avatarChar}
        </div>
        <span className="text-xs font-semibold text-text-primary">{displayName}</span>
        <div className="w-1.5 h-1.5 rounded-full bg-accord-emerald" title="Connected" />
      </button>

      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-52 card p-2 z-[200] pointer-events-auto"
          >
            <div className="px-3 py-2 border-b border-bg-border mb-1">
              <p className="text-xs text-text-tertiary">Connected via</p>
              <p className="text-xs font-semibold text-accord-violet mt-0.5">
                {zkSession ? 'zkLogin (Google)' : 'Sui Wallet'}
              </p>
            </div>
            <button
              onClick={handleRequestFaucet}
              disabled={isMinting}
              className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-accord-emerald hover:bg-accord-emerald/5 rounded-lg transition-all duration-150 disabled:opacity-50 border-b border-bg-border mb-1"
            >
              {isMinting ? 'Requesting...' : 'Request $10,000 USDsui (Faucet)'}
            </button>
            <button
              onClick={() => {
                disconnect();
                if (zkSession) {
                  clearZkLoginSession();
                  setShowMenu(false);
                  window.location.reload();
                } else {
                  setShowMenu(false);
                }
              }}
              className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-accord-red hover:bg-accord-red/5 rounded-lg transition-all duration-150"
            >
              Disconnect
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
