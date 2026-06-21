'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { WalletMask } from '@/components/ui/WalletMask';
import { CovenantCard, type CovenantData } from '@/components/covenant/CovenantCard';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useOwnedCovenants } from '@/lib/hooks';
import { formatUsdsui } from '@/lib/sui-client';
import { getZkLoginSession } from '@/lib/zklogin';

type Tab = 'client' | 'contractor';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('client');
  const account = useCurrentAccount();
  const zkSession = typeof window !== 'undefined' ? getZkLoginSession() : null;
  const address = zkSession?.address ?? account?.address ?? null;

  const { covenants, loading, error } = useOwnedCovenants(
    address,
    activeTab === 'client' ? 'client' : 'contractor'
  );

  const totalReleased = covenants
    .filter(c => c.milestones.every(m => m.status === 2))
    .reduce((sum, c) => sum + c.totalAmountUsdsui, BigInt(0));

  const loadingOrEmpty = loading || covenants.length === 0;

  return (
    <div className="min-h-screen bg-bg-deep">
      {/* ── Grid bg ─── */}
      <div
        className="fixed inset-0 pointer-events-none opacity-50"
        style={{
          backgroundImage:
            'linear-gradient(rgba(79,142,247,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(79,142,247,0.03) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* ── Navbar ─── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto border-b border-bg-border">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-gradient-accord">
          ACCORD
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/covenant/new" className="btn-primary text-xs">
            + New Covenant
          </Link>
          <WalletMask />
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-10">
        {/* ── Page header ─── */}
        <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight mb-1">Dashboard</h1>
            <p className="text-text-secondary text-sm">
              {address
                ? `Connected: ${address.slice(0, 8)}…${address.slice(-4)}`
                : 'Sign in to view your covenants'}
            </p>
          </div>

          {/* Summary chips — real on-chain aggregation */}
          <div className="flex gap-3 flex-wrap">
            <div className="card px-4 py-2.5 flex items-center gap-2">
              <span className="text-lg font-extrabold text-accord-emerald font-mono">
                {totalReleased > 0 ? formatUsdsui(totalReleased) : '$0.00'}
              </span>
              <span className="text-xs text-text-secondary">Total Released</span>
            </div>
            <div className="card px-4 py-2.5 flex items-center gap-2">
              <span className="text-lg font-extrabold text-accord-blue font-mono">
                {covenants.length}
              </span>
              <span className="text-xs text-text-secondary">Covenants</span>
            </div>
          </div>
        </div>

        {/* ── Sign-in prompt if not connected ─── */}
        {!address && !loading && (
          <div className="card p-12 text-center mb-8">
            <p className="text-text-secondary mb-4">
              Connect your wallet to see your covenants on Sui.
            </p>
            <WalletMask />
          </div>
        )}

        {/* ── Tabs ─── */}
        <div className="flex gap-1 mb-8 p-1 bg-bg-surface rounded-xl border border-bg-border w-fit">
          {(['client', 'contractor'] as Tab[]).map((tab) => (
            <button
              key={tab}
              id={`tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={`relative px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 capitalize ${
                activeTab === tab
                  ? 'text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {activeTab === tab && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute inset-0 rounded-lg bg-bg-elevated border border-bg-border"
                  transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }}
                />
              )}
              <span className="relative z-10">{tab === 'client' ? '👤 As Client' : '🛠 As Contractor'}</span>
            </button>
          ))}
        </div>

        {/* ── Loading state ─── */}
        {loading && address && (
          <div className="card p-12 text-center">
            <div className="w-8 h-8 border-2 border-accord-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-text-secondary text-sm">Querying Sui blockchain…</p>
          </div>
        )}

        {/* ── Error state ─── */}
        {error && address && (
          <div className="card p-8 text-center border-accord-red/30 mb-6">
            <p className="text-accord-red text-sm mb-2">⚠ Failed to load covenants</p>
            <p className="text-xs text-text-tertiary">{error}</p>
          </div>
        )}

        {/* ── Covenant cards — real on-chain data ─── */}
        {!loading && address && (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              {covenants.length === 0 ? (
                <div className="card p-16 text-center">
                  <p className="text-text-secondary mb-4">
                    No covenants found as {activeTab}.
                  </p>
                  {activeTab === 'client' && (
                    <Link href="/covenant/new" className="btn-primary">
                      Create your first covenant
                    </Link>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {covenants.map((c) => (
                    <CovenantCard
                      key={c.id}
                      covenant={c}
                      viewAs={activeTab}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}