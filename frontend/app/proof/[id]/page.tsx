'use client';

// Force dynamic rendering — pages use @mysten/dapp-kit wallet hooks which
// require a browser context and cannot be statically prerendered.
export const dynamic = 'force-dynamic';

import { useState, useEffect, use } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { getExplorerUrl, formatAddress } from '@/lib/sui-client';
import { getWalrusBlobUrl } from '@/lib/walrus';
import { useProofCertificate } from '@/lib/hooks';

function ProofLink({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div className="bg-bg-deep/40 rounded-xl px-4 py-3 border border-bg-border group">
      <p className="text-xs text-text-tertiary mb-1">{label}</p>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-xs font-mono text-accord-blue hover:text-accord-blue/80 transition-colors break-all group-hover:underline"
      >
        {value}
      </a>
    </div>
  );
}

export default function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { certificate: cert, loading, error } = useProofCertificate(id);

  return (
    <div className="min-h-screen bg-bg-deep flex flex-col">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 30%, rgba(16,185,129,0.07) 0%, transparent 70%)',
        }}
      />

      {/* ── Navbar ─── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto w-full border-b border-bg-border">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-gradient-accord">
          ACCORD
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="btn-ghost text-xs">Dashboard</Link>
        </div>
      </nav>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        {loading && (
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-accord-emerald border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-text-secondary">Loading certificate from Sui…</p>
          </div>
        )}

        {error && (
          <div className="card p-8 text-center border-accord-red/30 max-w-md">
            <p className="text-accord-red font-bold mb-2">Certificate Not Found</p>
            <p className="text-text-secondary text-sm mb-4">{error}</p>
            <Link href="/dashboard" className="btn-ghost text-xs">Back to Dashboard</Link>
          </div>
        )}

        {cert && (
          <div className="w-full max-w-2xl">
            {/* ── Certificate card ─── */}
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="relative rounded-3xl overflow-hidden"
              style={{
                background: 'linear-gradient(145deg, #0E1526 0%, #162035 100%)',
                border: '1px solid rgba(16,185,129,0.35)',
                boxShadow: '0 0 60px rgba(16,185,129,0.12), 0 24px 64px rgba(0,0,0,0.6)',
              }}
            >
              {/* ── Top accent bar ─── */}
              <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #4F8EF7, #8B5CF6, #10B981)' }} />

              <div className="p-8 sm:p-10">
                {/* ── Header ─── */}
                <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
                  <div>
                    <span className="text-xs font-extrabold text-accord-blue tracking-widest">ACCORD</span>
                    <p className="text-xs text-text-tertiary mt-0.5">Autonomous Work Protocol</p>
                  </div>

                  {/* Verification badge — live on-chain */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3, type: 'spring', bounce: 0.4 }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
                    style={{
                      background: 'rgba(16,185,129,0.1)',
                      borderColor: 'rgba(16,185,129,0.3)',
                    }}
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', bounce: 0.5 }}
                      className="w-2 h-2 rounded-full bg-accord-emerald"
                    />
                    <span className="text-xs font-bold text-accord-emerald">Verified On-Chain</span>
                  </motion.div>
                </div>

                {/* ── Proof Certificate label ─── */}
                <div className="mb-2">
                  <p className="text-xs text-text-tertiary uppercase tracking-widest font-semibold">Proof Certificate</p>
                </div>

                {/* ── Title ─── */}
                <h1 className="text-2xl font-extrabold tracking-tight mb-1">
                  Covenant {cert.covenantId.slice(0, 14)}…
                </h1>
                <p className="text-text-secondary text-sm mb-8">
                  Milestone {cert.milestoneIndex + 1} · On-chain verification #{cert.id.slice(0, 14)}…
                </p>

                {/* ── Amount ─── */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mb-8"
                >
                  <p className="text-4xl font-extrabold font-mono text-accord-emerald">
                    ${(Number(cert.amountUsdsui) / 1_000_000).toFixed(2)}
                  </p>
                  <p className="text-xs text-text-tertiary mt-1">USDSUI · Released Automatically</p>
                </motion.div>

                {/* ── Metadata grid ─── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  {[
                    { label: 'Client', value: formatAddress(cert.client) },
                    { label: 'Contractor', value: formatAddress(cert.contractor) },
                    { label: 'Sui Epoch', value: `#${cert.issuedAtEpoch}` },
                    { label: 'Certificate ID', value: `${cert.id.slice(0, 12)}…`, mono: true },
                  ].map(({ label, value, mono }) => (
                    <div key={label} className="bg-bg-deep/60 rounded-xl p-4 border border-bg-border">
                      <p className="text-xs text-text-tertiary mb-1">{label}</p>
                      <p className={`text-sm font-semibold ${mono ? 'font-mono text-accord-blue' : 'text-text-primary'}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* ── Walrus proof links ─── */}
                <div className="space-y-3 mb-8">
                  <ProofLink
                    label="Deliverable Blob (Walrus)"
                    value={cert.walrusBlobId}
                    href={getWalrusBlobUrl(cert.walrusBlobId)}
                  />
                  <ProofLink
                    label="Certificate Archive (Walrus)"
                    value={cert.walrusCertBlobId}
                    href={getWalrusBlobUrl(cert.walrusCertBlobId)}
                  />
                </div>

                {/* ── Seal ─── */}
                <div className="flex justify-center">
                  <motion.div
                    initial={{ scale: 0, rotate: -15 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.8, type: 'spring', bounce: 0.5 }}
                    className="relative"
                  >
                    <div
                      className="w-24 h-24 rounded-full flex items-center justify-center"
                      style={{
                        border: '2px solid #10B981',
                        background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
                        boxShadow: '0 0 32px rgba(16,185,129,0.25)',
                      }}
                    >
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center"
                        style={{ border: '1px solid rgba(16,185,129,0.4)' }}
                      >
                        <span className="text-2xl">✓</span>
                      </div>
                    </div>

                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ fontSize: '6px', letterSpacing: '2px', color: 'rgba(16,185,129,0.5)' }}
                    >
                      <svg viewBox="0 0 100 100" className="absolute w-full h-full">
                        <defs>
                          <path id="circle-text-path" d="M 50,50 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
                        </defs>
                        <text className="fill-current" style={{ fontSize: '6.5px', fill: 'rgba(16,185,129,0.6)', letterSpacing: '2.5px' }}>
                          <textPath href="#circle-text-path">ACCORD PROTOCOL · WALRUS · SUI ·</textPath>
                        </text>
                      </svg>
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>

            {/* ── Action buttons ─── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-3 mt-6"
            >
              <a
                href={getWalrusBlobUrl(cert.walrusCertBlobId)}
                target="_blank"
                rel="noreferrer"
                className="btn-emerald flex-1 justify-center py-3"
                id="download-certificate"
              >
                ↓ Download PDF Certificate
              </a>
              <button
                id="share-certificate"
                className="btn-ghost flex-1 py-3"
                onClick={() => navigator.clipboard.writeText(window.location.href)}
              >
                🔗 Share Certificate
              </button>
            </motion.div>

            <p className="text-center text-xs text-text-tertiary mt-6">
              This proof is cryptographically verified on Sui and stored immutably on Walrus forever.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}