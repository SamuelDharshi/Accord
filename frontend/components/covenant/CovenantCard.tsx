'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { formatUsdsui, formatAddress } from '@/lib/sui-client';

export interface MilestoneData {
  description: string;
  percentageBps: number;
  status: 0 | 1 | 2 | 3; // pending, delivered, released, disputed
  walrusBlobId: string | null;
}

export interface CovenantData {
  id: string;
  title: string;
  client: string;
  contractor: string;
  totalAmountUsdsui: number | bigint;
  milestones: MilestoneData[];
  createdAt: number;
  isConfidential: boolean;
}

const STATUS_LABELS: Record<number, string> = {
  0: 'Awaiting Delivery',
  1: 'Under Review',
  2: 'Payment Released',
  3: 'Disputed',
};

const STATUS_BADGE_CLASS: Record<number, string> = {
  0: 'badge-pending',
  1: 'badge-review',
  2: 'badge-released',
  3: 'badge-disputed',
};

function getOverallStatus(milestones: MilestoneData[]): 0 | 1 | 2 | 3 {
  if (milestones.some((m) => m.status === 3)) return 3;
  if (milestones.some((m) => m.status === 1)) return 1;
  if (milestones.every((m) => m.status === 2)) return 2;
  return 0;
}

function MilestoneProgressBar({ milestones }: { milestones: MilestoneData[] }) {
  const released = milestones.filter((m) => m.status === 2).length;
  const total = milestones.length;
  const pct = (released / total) * 100;

  return (
    <div className="h-1 bg-bg-elevated rounded-full overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ background: 'linear-gradient(90deg, #4F8EF7, #10B981)' }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  );
}

// ── Covenant Seal Animation ────────────────────────────────────────────────────
function CovenantSeal() {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -15, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', bounce: 0.5, duration: 0.7 }}
      className="flex flex-col items-center mt-4"
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{
          border: '2px solid #10B981',
          background: 'rgba(16,185,129,0.1)',
          boxShadow: '0 0 20px rgba(16,185,129,0.3)',
        }}
      >
        <span className="text-2xl">✓</span>
      </div>
      <p className="text-xs text-accord-emerald font-bold mt-2">Sealed</p>
    </motion.div>
  );
}

export function CovenantCard({
  covenant,
  viewAs,
}: {
  covenant: CovenantData;
  viewAs: 'client' | 'contractor';
}) {
  const [expanded, setExpanded] = useState(false);
  const overallStatus = getOverallStatus(covenant.milestones);
  const isFullyReleased = overallStatus === 2;
  const releasedMilestones = covenant.milestones.filter((m) => m.status === 2).length;
  const amountNum =
    typeof covenant.totalAmountUsdsui === 'bigint'
      ? Number(covenant.totalAmountUsdsui)
      : covenant.totalAmountUsdsui;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl cursor-pointer"
      style={{
        background: '#0E1526',
        // Animate border color from blue → emerald when fully released.
        border: isFullyReleased
          ? '1px solid rgba(16,185,129,0.45)'
          : '1px solid #1E2D4A',
        boxShadow: isFullyReleased
          ? '0 0 28px rgba(16,185,129,0.15), 0 4px 24px rgba(0,0,0,0.4)'
          : '0 4px 24px rgba(0,0,0,0.4)',
        transition: 'border-color 0.8s ease, box-shadow 0.8s ease',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* ── Released sweep overlay ─── */}
      <AnimatePresence>
        {isFullyReleased && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 pointer-events-none rounded-2xl"
            style={{
              background: 'radial-gradient(ellipse 80% 60% at 50% 100%, rgba(16,185,129,0.06) 0%, transparent 70%)',
            }}
          />
        )}
      </AnimatePresence>

      <div className="p-6">
        {/* ── Header row ─── */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={STATUS_BADGE_CLASS[overallStatus]}>
                {STATUS_LABELS[overallStatus]}
              </span>
              {covenant.isConfidential && (
                <span className="text-xs text-text-tertiary">🔒</span>
              )}
            </div>
            <h3 className="font-bold text-base truncate">{covenant.title}</h3>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-mono text-lg font-extrabold text-accord-emerald">
              {formatUsdsui(amountNum)}
            </p>
          </div>
        </div>

        {/* ── Counterparty ─── */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded-full bg-accord-blue/20 flex items-center justify-center text-xs font-bold text-accord-blue">
            {viewAs === 'client' ? '🛠' : '👤'}
          </div>
          <p className="text-xs text-text-secondary font-mono">
            {formatAddress(viewAs === 'client' ? covenant.contractor : covenant.client)}
          </p>
        </div>

        {/* ── Progress bar ─── */}
        <div className="mb-3">
          <MilestoneProgressBar milestones={covenant.milestones} />
        </div>

        {/* ── Milestone count ─── */}
        <p className="text-xs text-text-tertiary">
          {releasedMilestones}/{covenant.milestones.length} milestones released
        </p>

        {/* ── Expanded milestone list ─── */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-5 space-y-2 pt-4 border-t border-bg-border">
                {covenant.milestones.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-2 px-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.02)' }}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                        m.status === 2
                          ? 'bg-accord-emerald/20 text-accord-emerald'
                          : m.status === 1
                          ? 'bg-accord-violet/20 text-accord-violet'
                          : m.status === 3
                          ? 'bg-accord-red/20 text-accord-red'
                          : 'bg-accord-blue/10 text-text-tertiary'
                      }`}
                    >
                      {m.status === 2 ? '✓' : m.status === 3 ? '!' : i + 1}
                    </div>
                    <p className="text-xs text-text-secondary flex-1 truncate">{m.description}</p>
                    <p className="text-xs font-mono text-accord-blue flex-shrink-0">
                      {formatUsdsui((amountNum * m.percentageBps) / 10000)}
                    </p>
                  </div>
                ))}

                <Link
                  href={`/covenant/${covenant.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="block w-full mt-3 btn-ghost text-center text-xs py-2"
                >
                  View Full Covenant →
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Seal (only if fully released) ─── */}
        {isFullyReleased && !expanded && <CovenantSeal />}
      </div>
    </motion.div>
  );
}
