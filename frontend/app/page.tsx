'use client';

// Force dynamic rendering — pages use @mysten/dapp-kit wallet hooks which
// require a browser context and cannot be statically prerendered.
export const dynamic = 'force-dynamic';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { WalletMask } from '@/components/ui/WalletMask';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg-deep overflow-hidden">
      {/* ── Grid background ─────────────────────────────────────── */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(79,142,247,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(79,142,247,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* ── Radial glow ─────────────────────────────────────────── */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(79,142,247,0.12) 0%, transparent 70%)',
        }}
      />

      {/* ── Navbar ──────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-extrabold tracking-tight text-gradient-accord">
            ACCORD
          </span>
          <span className="text-xs text-text-tertiary font-mono px-1.5 py-0.5 rounded bg-bg-elevated border border-bg-border">
            β
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="btn-ghost text-xs">
            Dashboard
          </Link>
          <WalletMask />
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-28 text-center">
        {/* Pill badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full border border-accord-violet/30 bg-accord-violet/10 text-accord-violet text-sm font-semibold"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accord-violet opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accord-violet" />
          </span>
          Powered by Walrus Memory & Sui AI Agent
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08] mb-6"
          style={{ letterSpacing: '-0.04em' }}
        >
          <span className="text-text-primary">Work. Verify.</span>
          <br />
          <span className="text-gradient-accord">Pay. Automatically.</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Accord's AI agent <span className="text-accord-violet font-semibold">Arca</span> watches for delivery, verifies against the agreed brief, and releases escrowed payment — in a single atomic transaction. No middlemen. Zero fees. Cryptographic proof stored forever on Walrus.
        </motion.p>

        {/* CTA buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link href="/covenant/new" className="btn-primary text-base px-8 py-3.5">
            Create a Covenant
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <Link href="/dashboard" className="btn-ghost text-base px-8 py-3.5">
            View Dashboard
          </Link>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex items-center justify-center gap-10 mt-16 flex-wrap"
        >
          {[
            { value: '0.4s', label: 'Settlement Time' },
            { value: '$0', label: 'Fees (Gas Sponsored)' },
            { value: '0.5%', label: 'Protocol Fee Only' },
            { value: '∞', label: 'Walrus Storage' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-2xl font-extrabold text-gradient-accord font-mono">{value}</p>
              <p className="text-xs text-text-tertiary mt-1">{label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── How It Works ────────────────────────────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl font-extrabold mb-3" style={{ letterSpacing: '-0.03em' }}>
            Five steps. Zero friction.
          </h2>
          <p className="text-text-secondary">
            From agreement to payment — entirely autonomous.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="card p-5 flex flex-col gap-3 group hover:border-accord-blue/40 transition-colors duration-300"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-extrabold"
                style={{ background: step.color + '20', color: step.color }}
              >
                {i + 1}
              </div>
              <h3 className="font-bold text-sm text-text-primary">{step.title}</h3>
              <p className="text-xs text-text-secondary leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Sui Technology Stack ────────────────────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <div className="card p-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-extrabold mb-2">Built on the full Sui stack</h2>
            <p className="text-text-secondary text-sm">Every primitive used with purpose.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {TECH_STACK.map((tech) => (
              <div
                key={tech.name}
                className="flex items-start gap-3 p-4 rounded-xl bg-bg-elevated border border-bg-border"
              >
                <span className="text-lg">{tech.icon}</span>
                <div>
                  <p className="text-xs font-bold text-text-primary">{tech.name}</p>
                  <p className="text-xs text-text-tertiary mt-0.5">{tech.use}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA bottom ──────────────────────────────────────────── */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 pb-32 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="card p-12"
          style={{
            background: 'linear-gradient(135deg, rgba(79,142,247,0.08) 0%, rgba(139,92,246,0.08) 100%)',
            border: '1px solid rgba(79,142,247,0.2)',
          }}
        >
          <h2 className="text-3xl font-extrabold mb-4" style={{ letterSpacing: '-0.03em' }}>
            Ready to get paid automatically?
          </h2>
          <p className="text-text-secondary mb-8">
            Sign in with Google. No wallet setup. No gas fees. No waiting.
          </p>
          <Link href="/covenant/new" className="btn-primary text-base px-10 py-4">
            Start with Accord
          </Link>
        </motion.div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-bg-border py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <span className="text-gradient-accord font-extrabold tracking-tight">ACCORD</span>
          <p className="text-xs text-text-tertiary">
            Built on Walrus · Powered by Sui · Automated by Arca · Sui Overflow 2026
          </p>
        </div>
      </footer>
    </div>
  );
}

const STEPS = [
  {
    title: 'Describe the agreement',
    desc: 'Type naturally: "Pay $500 when 3 logo concepts are uploaded."',
    color: '#4F8EF7',
  },
  {
    title: 'Accord structures it',
    desc: 'Arca parses your terms into a structured Covenant with milestone escrow.',
    color: '#8B5CF6',
  },
  {
    title: 'Contractor receives a link',
    desc: 'Signs in with Google. Sees milestones and upload zone. No crypto needed.',
    color: '#4F8EF7',
  },
  {
    title: 'Arca verifies delivery',
    desc: 'Files stored on Walrus. AI checks content against brief. 10 seconds.',
    color: '#8B5CF6',
  },
  {
    title: 'Payment releases instantly',
    desc: 'USDSUI transferred atomically. Proof Certificate sealed forever on Walrus.',
    color: '#10B981',
  },
];

const TECH_STACK = [
  { icon: '🦭', name: 'Walrus Storage', use: 'Immutable deliverable archive' },
  { icon: '🧠', name: 'Walrus Memory', use: 'Cross-project AI context' },
  { icon: '🔐', name: 'zkLogin', use: 'Google → non-custodial wallet' },
  { icon: '⛽', name: 'Sponsored TXs', use: 'Zero gas exposure' },
  { icon: '💵', name: 'USDsui', use: 'Stablecoin escrow' },
  { icon: '⚛️', name: 'PTBs', use: 'Atomic 5-step execution' },
  { icon: '🤖', name: 'Claude API', use: 'AI delivery verification' },
  { icon: '🔑', name: 'Move Caps', use: 'ArcaCap security pattern' },
];
