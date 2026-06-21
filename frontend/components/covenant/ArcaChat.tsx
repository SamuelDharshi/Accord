'use client';

/**
 * ArcaChat — Reusable chat interface for the Arca AI agent.
 *
 * Extracted from `covenant/new/page.tsx` to fix architecture drift (PRD gap).
 * Stateless regarding covenant structure — all state lives in the parent.
 */

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

export interface ChatMessage {
  role: 'user' | 'arca';
  content: string;
  timestamp: number;
}

interface ArcaChatProps {
  messages: ChatMessage[];
  input: string;
  isProcessing: boolean;
  disabled?: boolean;
  placeholder?: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
}

export function ArcaChat({
  messages,
  input,
  isProcessing,
  disabled = false,
  placeholder = 'Ask Arca anything…',
  onInputChange,
  onSend,
}: ArcaChatProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="card flex-1 flex flex-col min-h-[420px]">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-bg-border">
        <div className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accord-violet opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accord-violet" />
        </div>
        <span className="text-xs font-semibold text-accord-violet">Arca</span>
        <span className="text-xs text-text-tertiary">· AI Verification Agent</span>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                msg.role === 'arca'
                  ? 'bg-accord-violet/20 text-accord-violet'
                  : 'bg-accord-blue/20 text-accord-blue'
              }`}
            >
              {msg.role === 'arca' ? '⚡' : 'Y'}
            </div>
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'arca'
                  ? 'bg-bg-elevated border border-bg-border text-text-primary rounded-tl-sm'
                  : 'bg-accord-blue/15 border border-accord-blue/20 text-text-primary rounded-tr-sm'
              }`}
            >
              {msg.content}
            </div>
          </motion.div>
        ))}

        {/* Typing indicator */}
        {isProcessing && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-accord-violet/20 text-accord-violet flex items-center justify-center text-xs font-bold">
              ⚡
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-bg-elevated border border-bg-border">
              <div className="flex gap-1">
                {[0, 1, 2].map((d) => (
                  <motion.div
                    key={d}
                    className="w-1.5 h-1.5 rounded-full bg-accord-violet"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, delay: d * 0.15, repeat: Infinity }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* ── Input ── */}
      {!disabled && (
        <div className="border-t border-bg-border p-4">
          <div className="flex gap-3">
            <textarea
              id="arca-input"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder={placeholder}
              rows={3}
              className="input resize-none text-sm flex-1"
            />
            <button
              id="send-message"
              onClick={onSend}
              disabled={!input.trim() || isProcessing}
              className="btn-primary px-4 self-end disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
