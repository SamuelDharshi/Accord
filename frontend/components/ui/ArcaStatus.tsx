'use client';

import { motion, AnimatePresence } from 'framer-motion';

type ArcaState = 'idle' | 'analyzing' | 'pass' | 'fail' | 'review';

interface ArcaStatusProps {
  state: ArcaState;
  message?: string;
  confidence?: number;
}

const STATE_CONFIG: Record<ArcaState, { label: string; color: string; bg: string; border: string }> = {
  idle: {
    label: 'Arca Standby',
    color: '#7B8DB0',
    bg: 'rgba(123,141,176,0.08)',
    border: 'rgba(123,141,176,0.2)',
  },
  analyzing: {
    label: 'Arca Analyzing',
    color: '#8B5CF6',
    bg: 'rgba(139,92,246,0.08)',
    border: 'rgba(139,92,246,0.25)',
  },
  pass: {
    label: 'Arca: PASS',
    color: '#10B981',
    bg: 'rgba(16,185,129,0.08)',
    border: 'rgba(16,185,129,0.25)',
  },
  fail: {
    label: 'Arca: FAIL',
    color: '#EF4444',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.25)',
  },
  review: {
    label: 'Arca: REVIEW',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.25)',
  },
};

export function ArcaStatus({ state, message, confidence }: ArcaStatusProps) {
  const config = STATE_CONFIG[state];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2 }}
        className="flex items-center gap-3 px-4 py-3 rounded-xl border"
        style={{ background: config.bg, borderColor: config.border }}
      >
        {/* Indicator dot */}
        <div className="relative flex h-2.5 w-2.5 flex-shrink-0">
          {state === 'analyzing' && (
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: config.color }}
            />
          )}
          <span
            className="relative inline-flex rounded-full h-2.5 w-2.5"
            style={{ background: config.color }}
          />
        </div>

        {/* Label */}
        <span className="text-xs font-bold" style={{ color: config.color }}>
          {config.label}
        </span>

        {/* Confidence */}
        {confidence !== undefined && (
          <span className="text-xs font-mono text-text-tertiary ml-auto">
            {confidence}% confidence
          </span>
        )}

        {/* Custom message */}
        {message && (
          <span className="text-xs text-text-secondary ml-2 truncate">{message}</span>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
