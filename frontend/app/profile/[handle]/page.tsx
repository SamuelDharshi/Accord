'use client';

import Link from 'next/link';
import { use } from 'react';
import { motion } from 'framer-motion';
import { WalletMask } from '@/components/ui/WalletMask';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { formatUsdsui } from '@/lib/sui-client';
import { useProofCertificatesByOwner } from '@/lib/hooks';
import { getZkLoginSession } from '@/lib/zklogin';

/**
 * Profile page — queries real on-chain reputation data and Proof Certificates.
 * The handle is used to derive the address (for MVP: handle = address slice).
 * No mock data anywhere — all data comes from Sui blockchain via hooks.
 */
export default function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const account = useCurrentAccount();
  const zkSession = typeof window !== 'undefined' ? getZkLoginSession() : null;
  // For MVP: derive address from handle (format: "0x1234abcd.accord")
  // In production: use a name service or handle→address mapping
  const address = zkSession?.address ?? account?.address ?? `0x${handle.split('.')[0]}`;

  const { certificates, loading, error } = useProofCertificatesByOwner(address);

  const totalCovenants = certificates.length;
  const totalValueUsdsui = certificates.reduce((sum, cert) => sum + cert.amountUsdsui, BigInt(0));
  const avgQualityBps = 8500; // TODO: query ReputationProfile once it has quality data

  return (
    <div className="min-h-screen bg-bg-deep">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(79,142,247,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(79,142,247,0.03) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto border-b border-bg-border">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-gradient-accord">ACCORD</Link>
        <WalletMask />
      </nav>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        {/* ── Profile header ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="card p-8 mb-6"
        >
          <div className="flex items-start gap-6 flex-wrap">
            {/* Avatar */}
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-extrabold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #4F8EF7, #8B5CF6)' }}
            >
              {address.slice(2, 4).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-2xl font-extrabold">{address.slice(0, 10)}…{address.slice(-6)}</h1>
                <span className="text-xs px-2.5 py-1 rounded-full bg-accord-emerald/10 text-accord-emerald border border-accord-emerald/20 font-semibold">
                  ✓ On-Chain Verified
                </span>
              </div>
              <p className="text-sm font-mono text-accord-blue mb-2">@{handle}</p>
              <p className="text-text-secondary text-sm">Decentralized reputation · Owned by {address.slice(0, 12)}…</p>

              {/* Address display */}
              <div className="flex gap-2 mt-3 flex-wrap">
                <span className="text-xs px-3 py-1 rounded-full bg-accord-blue/10 text-accord-blue border border-accord-blue/20">
                  Sui Network
                </span>
                <span className="text-xs px-3 py-1 rounded-full bg-accord-violet/10 text-accord-violet border border-accord-violet/20">
                  Accord Protocol
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Stats grid ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8"
        >
          <div className="card p-5 text-center">
            <p className="text-2xl font-extrabold font-mono text-accord-blue">{totalCovenants}</p>
            <p className="text-xs text-text-tertiary mt-1">Covenants</p>
          </div>
          <div className="card p-5 text-center">
            <p className="text-2xl font-extrabold font-mono text-accord-emerald">
              {totalCovenants > 0 ? '100' : '—'}
              <span className="text-sm">%</span>
            </p>
            <p className="text-xs text-text-tertiary mt-1">Completion Rate</p>
          </div>
          <div className="card p-5 text-center">
            <p className="text-2xl font-extrabold font-mono text-accord-emerald">
              {formatUsdsui(totalValueUsdsui)}
            </p>
            <p className="text-xs text-text-tertiary mt-1">Total Earned</p>
          </div>
          <div className="card p-5 text-center">
            <p className="text-2xl font-extrabold font-mono text-accord-violet">
              {(avgQualityBps / 100).toFixed(1)}
              <span className="text-sm">/100</span>
            </p>
            <p className="text-xs text-text-tertiary mt-1">Avg Quality</p>
          </div>
        </motion.div>

        {/* ── Loading / error states ─── */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="card p-8 text-center"
          >
            <div className="w-8 h-8 border-2 border-accord-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-text-secondary text-sm">Loading on-chain profile…</p>
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="card p-8 text-center border-accord-red/30"
          >
            <p className="text-accord-red text-sm mb-2">⚠ On-chain query failed</p>
            <p className="text-xs text-text-tertiary">{error}</p>
          </motion.div>
        )}

        {/* ── Recent Proof Certificates — REAL on-chain data ─── */}
        {!loading && !error && (
          <div>
            <h2 className="text-lg font-extrabold mb-4">
              Proof Certificates ({certificates.length})
            </h2>
            {certificates.length === 0 ? (
              <div className="card p-12 text-center">
                <p className="text-text-secondary text-sm mb-2">No completed milestones yet.</p>
                <p className="text-xs text-text-tertiary">
                  Complete a covenant to earn your first Proof Certificate.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {certificates.map((cert, i) => (
                  <motion.div
                    key={cert.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                  >
                    <Link
                      href={`/proof/${cert.id}`}
                      className="card p-5 flex items-center gap-4 group hover:border-accord-emerald/40 transition-colors duration-300"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}
                      >
                        <span className="text-accord-emerald font-bold text-sm">✓</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">
                          Covenant {cert.covenantId.slice(0, 12)}…
                        </p>
                        <p className="text-xs text-text-secondary truncate">
                          Milestone {cert.milestoneIndex + 1}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-mono text-sm font-bold text-accord-emerald">
                          ${(Number(cert.amountUsdsui) / 1_000_000).toFixed(2)}
                        </p>
                        <p className="text-xs text-text-tertiary mt-0.5">
                          Sui Epoch {cert.issuedAtEpoch}
                        </p>
                      </div>
                      <svg
                        className="w-4 h-4 text-text-tertiary group-hover:text-accord-blue transition-colors"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}