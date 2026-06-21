'use client';

import { motion } from 'framer-motion';
import { formatUsdsui } from '@/lib/sui-client';
import type { MilestoneData } from './CovenantCard';

const STATUS_LABELS: Record<number, string> = {
  0: 'Awaiting Delivery',
  1: 'Arca Reviewing',
  2: 'Payment Released',
  3: 'Disputed',
};

const STATUS_COLORS: Record<number, string> = {
  0: '#F59E0B',
  1: '#8B5CF6',
  2: '#10B981',
  3: '#EF4444',
};

interface MilestoneTimelineProps {
  milestones: MilestoneData[];
  totalAmount: number | bigint;
  onUpload?: (milestoneIndex: number) => void;
}

export function MilestoneTimeline({ milestones, totalAmount, onUpload }: MilestoneTimelineProps) {
  const amountNum = typeof totalAmount === 'bigint' ? Number(totalAmount) : totalAmount;

  return (
    <div className="space-y-0">
      {milestones.map((m, i) => {
        const milestoneAmount = (amountNum * m.percentageBps) / 10000;
        const isLast = i === milestones.length - 1;
        const color = STATUS_COLORS[m.status];

        return (
          <div key={i} className="flex gap-5">
            {/* ── Connector line + dot ─── */}
            <div className="flex flex-col items-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.1, type: 'spring', bounce: 0.4 }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 z-10"
                style={{
                  background: `${color}18`,
                  border: `2px solid ${color}`,
                  color,
                }}
              >
                {m.status === 2 ? '✓' : m.status === 3 ? '!' : i + 1}
              </motion.div>
              {!isLast && (
                <div className="w-0.5 flex-1 mt-1 mb-1" style={{ background: '#1E2D4A', minHeight: 24 }} />
              )}
            </div>

            {/* ── Content ─── */}
            <div className={`flex-1 pb-6 ${isLast ? '' : ''}`}>
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 + 0.1 }}
                className="card p-5"
                style={{
                  borderColor: m.status === 2 ? 'rgba(16,185,129,0.3)' : '#1E2D4A',
                  transition: 'border-color 0.6s ease',
                }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm mb-1">{m.description}</p>
                    <p
                      className="text-xs font-semibold"
                      style={{ color }}
                    >
                      {STATUS_LABELS[m.status]}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono text-sm font-bold text-accord-emerald">
                      {formatUsdsui(milestoneAmount)}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {(m.percentageBps / 100).toFixed(0)}%
                    </p>
                  </div>
                </div>

                {/* ── Walrus blob link (if delivered/released) ─── */}
                {m.walrusBlobId && (
                  <div className="mt-3 pt-3 border-t border-bg-border">
                    <p className="text-xs text-text-tertiary mb-1">Walrus Blob (Deliverable)</p>
                    <a
                      href={`${process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL}/v1/${m.walrusBlobId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-mono text-accord-blue hover:underline break-all"
                    >
                      {m.walrusBlobId}
                    </a>
                  </div>
                )}

                {/* ── Arca reviewing pulse ─── */}
                {m.status === 1 && (
                  <div className="mt-3 pt-3 border-t border-bg-border flex items-center gap-2">
                    <div className="relative flex h-2 w-2 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accord-violet opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-accord-violet" />
                    </div>
                    <p className="text-xs text-accord-violet font-semibold">
                      Arca is analyzing the delivery…
                    </p>
                  </div>
                )}

                {/* ── Upload trigger (for pending milestones) ─── */}
                {m.status === 0 && onUpload && (
                  <div className="mt-3 pt-3 border-t border-bg-border">
                    <button
                      id={`upload-milestone-${i}`}
                      onClick={() => onUpload(i)}
                      className="btn-primary text-xs py-2 px-4"
                    >
                      ↑ Upload Delivery
                    </button>
                  </div>
                )}

                {/* ── Proof certificate link (released) ─── */}
                {m.status === 2 && (
                  <div className="mt-3 pt-3 border-t border-accord-emerald/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-accord-emerald font-bold">✓ Payment Released</span>
                    </div>
                    {m.walrusBlobId && (
                      <a
                        href={`${process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL}/v1/${m.walrusBlobId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-accord-blue hover:underline"
                      >
                        View Deliverable on Walrus →
                      </a>
                    )}
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
