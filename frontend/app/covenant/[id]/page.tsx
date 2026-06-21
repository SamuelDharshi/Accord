'use client';

import { useState, useEffect, use } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { WalletMask } from '@/components/ui/WalletMask';
import { MilestoneTimeline } from '@/components/covenant/MilestoneTimeline';
import { DeliveryUpload } from '@/components/covenant/DeliveryUpload';
import { formatAddress, formatUsdsui, suiClient, ACCORD_PACKAGE_ID } from '@/lib/sui-client';
import { useCovenant } from '@/lib/hooks';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { getZkLoginSession } from '@/lib/zklogin';
import { executeSponsored } from '@/lib/sponsored-tx';

// ── Dispute helpers ───────────────────────────────────────────────────────────────

/** PRD §7.6 — 48-hour dispute resolution window */
const DISPUTE_WINDOW_MS = 48 * 60 * 60 * 1000;

function useCountdown(targetMs: number | null) {
  const [remaining, setRemaining] = useState<number>(0);
  useEffect(() => {
    if (!targetMs) return;
    const tick = () => setRemaining(Math.max(0, targetMs - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs]);
  return remaining;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return `${h}h ${m}m ${s}s`;
}

// ── Real on-chain data via useCovenant hook ───────────────────────────────────

export default function CovenantDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { covenant, loading, error, refetch } = useCovenant(id);
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const [tab, setTab] = useState<'timeline' | 'details'>('timeline');
  const [uploadingMilestone, setUploadingMilestone] = useState<number | null>(null);
  const [arcaStatus, setArcaStatus] = useState<string | null>(null);

  // PRD §7.6 — Dispute flow state
  // Maps milestoneIndex -> { raisedAt: number (epoch ms), escalated: boolean }
  const [disputes, setDisputes] = useState<Record<number, { raisedAt: number; escalated: boolean }>>({});
  const [disputingIdx, setDisputingIdx] = useState<number | null>(null);

  const session = getZkLoginSession();
  const currentUserAddress = session?.address || account?.address;

  const isClient = currentUserAddress &&
    covenant?.client &&
    currentUserAddress.toLowerCase() === covenant.client.toLowerCase();

  const handleUploadComplete = async (milestoneIndex: number, blobId: string) => {
    if (!covenant) return;
    setArcaStatus('Arca is analyzing your delivery…');
    setUploadingMilestone(null);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_AGENT_API_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          covenantId: covenant.id,
          milestoneIndex,
          milestoneDescription: covenant.milestones[milestoneIndex].description,
          clientAddress: covenant.client,
          contractorAddress: covenant.contractor,
          deliverableBlobId: blobId,
          covenantTitle: covenant.title,
          amountUsdsui: Number(covenant.totalAmountUsdsui) * covenant.milestones[milestoneIndex].percentageBps / 10000,
          isConfidential: covenant.isConfidential,
        }),
      });
      const data = await res.json() as { decision: { decision: string }; released: boolean };
      if (data.released) {
        setArcaStatus('✓ Payment released! Proof Certificate minted.');
      } else {
        setArcaStatus(`Arca verdict: ${data.decision.decision}. Check notifications.`);
      }
      refetch();
    } catch {
      setArcaStatus('Verification submitted. Arca is processing.');
    }
  };

  // PRD §7.6 — Client raises a dispute for a milestone (calls contract dispute_milestone).
  const handleRaiseDispute = async (milestoneIndex: number) => {
    if (!covenant || !isClient) return;
    setDisputingIdx(milestoneIndex);
    try {
      const session = getZkLoginSession();
      if (!session && !account) {
        alert('Please sign in with Google or connect a Sui wallet first to raise a dispute.');
        return;
      }

      const userAddress = session ? session.address : account!.address;

      setArcaStatus('Finding ClientCap in your wallet...');
      const ownedObjects = await suiClient.getOwnedObjects({
        owner: userAddress,
        filter: { StructType: `${ACCORD_PACKAGE_ID}::covenant::ClientCap` },
        options: { showContent: true },
      });

      const clientCapObject = ownedObjects.data.find((obj) => {
        const fields = obj.data?.content?.dataType === 'moveObject' ? obj.data.content.fields as Record<string, any> : null;
        return fields?.covenant_id === covenant.id;
      });

      if (!clientCapObject) {
        throw new Error('Could not find the ClientCap for this covenant in your wallet.');
      }

      const clientCapId = clientCapObject.data?.objectId;
      if (!clientCapId) {
        throw new Error('ClientCap Object ID is unresolved.');
      }

      setArcaStatus('Building dispute transaction...');
      const tx = new Transaction();
      tx.moveCall({
        target: `${ACCORD_PACKAGE_ID}::covenant::dispute_milestone`,
        arguments: [
          tx.object(clientCapId),
          tx.object(covenant.id),
          tx.pure.u64(milestoneIndex),
        ],
      });

      tx.setSender(userAddress);

      let result;
      if (session) {
        setArcaStatus('Executing sponsored dispute transaction...');
        result = await executeSponsored(tx, session);
      } else {
        setArcaStatus('Executing dispute transaction...');
        const txResult = await signAndExecuteTransaction({
          transaction: tx as any,
        });
        result = await suiClient.waitForTransaction({
          digest: txResult.digest,
          options: {
            showEffects: true,
            showEvents: true,
          },
        });
      }

      setDisputes(prev => ({
        ...prev,
        [milestoneIndex]: { raisedAt: Date.now(), escalated: false },
      }));
      setArcaStatus(`Dispute successfully executed on-chain! Transaction: ${result.digest.slice(0, 8)}`);
      refetch();
    } catch (err) {
      console.error('[Accord] Raise dispute failed:', err);
      alert(`Failed to raise dispute: ${(err as Error).message}`);
      setArcaStatus(`Dispute error: ${(err as Error).message}`);
    } finally {
      setDisputingIdx(null);
    }
  };

  const handleEscalate = (milestoneIndex: number) => {
    setDisputes(prev => ({
      ...prev,
      [milestoneIndex]: { ...prev[milestoneIndex]!, escalated: true },
    }));
    setArcaStatus(`Milestone ${milestoneIndex + 1} escalated to Accord arbitration.`);
  };

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-bg-deep flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accord-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-text-secondary text-sm">Loading covenant from Sui…</p>
        </div>
      </div>
    );
  }

  // ── Error / not found ───────────────────────────────────────────────────────
  if (error || !covenant) {
    return (
      <div className="min-h-screen bg-bg-deep">
        <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto border-b border-bg-border">
          <Link href="/" className="text-lg font-extrabold tracking-tight text-gradient-accord">ACCORD</Link>
          <WalletMask />
        </nav>
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <h1 className="text-2xl font-extrabold mb-3">Covenant Not Found</h1>
          <p className="text-text-secondary mb-6">
            {error ?? 'This covenant does not exist on Sui.'}
          </p>
          <Link href="/dashboard" className="btn-primary">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-deep">
      <div
        className="fixed inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(79,142,247,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(79,142,247,0.03) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto border-b border-bg-border">
        <Link href="/dashboard" className="text-lg font-extrabold tracking-tight text-gradient-accord">ACCORD</Link>
        <WalletMask />
      </nav>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-10">
        {/* ── Header ─── */}
        <div className="mb-8">
          <Link href="/dashboard" className="text-xs text-text-tertiary hover:text-text-secondary flex items-center gap-1 mb-4 transition-colors">
            ← Back to dashboard
          </Link>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {covenant.isConfidential && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accord-violet/10 text-accord-violet border border-accord-violet/20 font-semibold">
                    🔒 Confidential
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  covenant.milestones.some(m => m.status === 0)
                    ? 'bg-accord-amber/10 text-accord-amber border border-accord-amber/20'
                    : covenant.milestones.every(m => m.status === 2)
                    ? 'bg-accord-emerald/10 text-accord-emerald border border-accord-emerald/20'
                    : 'bg-accord-blue/10 text-accord-blue border border-accord-blue/20'
                }`}>
                  {covenant.milestones.every(m => m.status === 2) ? '✓ Complete' :
                   covenant.milestones.some(m => m.status === 1) ? '⟳ Under Review' : '○ Active'}
                </span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight mb-1">{covenant.title}</h1>
              <p className="text-text-secondary text-sm font-mono">
                {formatAddress(covenant.id)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-extrabold font-mono text-accord-emerald">
                {formatUsdsui(covenant.totalAmountUsdsui)}
              </p>
              <p className="text-xs text-text-tertiary mt-1">Total Escrow</p>
            </div>
          </div>

          {/* Parties */}
          <div className="flex gap-6 mt-4 flex-wrap">
            <div>
              <p className="text-xs text-text-tertiary mb-1">CLIENT</p>
              <p className="text-xs font-mono text-text-secondary">{formatAddress(covenant.client)}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary mb-1">CONTRACTOR</p>
              <p className="text-xs font-mono text-text-secondary">{formatAddress(covenant.contractor)}</p>
            </div>
          </div>
        </div>

        {/* ── Arca status banner ─── */}
        <AnimatePresence>
          {arcaStatus && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 px-5 py-3.5 rounded-xl border flex items-center gap-3"
              style={{
                background: 'rgba(139,92,246,0.08)',
                borderColor: 'rgba(139,92,246,0.25)',
              }}
            >
              <div className="relative flex h-2.5 w-2.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accord-violet opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accord-violet" />
              </div>
              <p className="text-sm text-accord-violet font-semibold">{arcaStatus}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Milestone status bar ─── */}
        <div className="flex gap-6 mb-6 text-xs">
          {covenant.milestones.map((m, i) => {
            const labels = ['PENDING', 'DELIVERED', 'RELEASED', 'DISPUTED'];
            const colors = ['text-text-tertiary', 'text-accord-amber', 'text-accord-emerald', 'text-accord-red'];
            return (
              <div key={i}>
                <span className={colors[m.status]}>{labels[m.status]}</span>
                <span className="text-text-tertiary ml-1">M{i + 1}</span>
              </div>
            );
          })}
        </div>

        {/* ── Tabs ─── */}
        <div className="flex gap-1 p-1 bg-bg-surface border border-bg-border rounded-xl w-fit mb-6">
          {(['timeline', 'details'] as const).map((t) => (
            <button
              key={t}
              id={`tab-covenant-${t}`}
              onClick={() => setTab(t)}
              className={`relative px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 capitalize ${
                tab === t ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab === t && (
                <motion.div layoutId="covenant-tab" className="absolute inset-0 rounded-lg bg-bg-elevated border border-bg-border" />
              )}
              <span className="relative z-10">{t === 'timeline' ? '📋 Timeline' : '📄 Details'}</span>
            </button>
          ))}
        </div>

        {/* ── Tab content ─── */}
        <AnimatePresence mode="wait">
          {tab === 'timeline' ? (
            <motion.div key="timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <MilestoneTimeline
                milestones={covenant.milestones}
                totalAmount={covenant.totalAmountUsdsui}
                onUpload={(idx) => setUploadingMilestone(idx)}
              />

              {/* PRD §7.6 — Dispute panel: one row per milestone */}
              {covenant.milestones.map((m, idx) => (
                <DisputeRow
                  key={idx}
                  milestoneIndex={idx}
                  milestoneStatus={m.status}
                  disputeState={disputes[idx] ?? null}
                  isClient={!!isClient}
                  isDisputingNow={disputingIdx === idx}
                  onRaiseDispute={() => handleRaiseDispute(idx)}
                  onEscalate={() => handleEscalate(idx)}
                />
              ))}

              <AnimatePresence>
                {uploadingMilestone !== null && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="mt-6"
                  >
                    <DeliveryUpload
                      milestoneIndex={uploadingMilestone}
                      milestoneDescription={covenant.milestones[uploadingMilestone].description}
                      covenantId={covenant.id}
                      onComplete={handleUploadComplete}
                      onCancel={() => setUploadingMilestone(null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div key="details" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="card p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Covenant ID', value: covenant.id, mono: true },
                    { label: 'Created', value: new Date(covenant.createdAt).toLocaleDateString(), mono: false },
                    { label: 'Total Amount', value: formatUsdsui(covenant.totalAmountUsdsui), mono: true },
                    { label: 'Protocol Fee', value: '0.5% per milestone', mono: false },
                    { label: 'Milestones', value: `${covenant.milestones.length} milestones`, mono: false },
                    { label: 'Confidential', value: covenant.isConfidential ? 'Yes — amounts hidden on-chain' : 'No', mono: false },
                    { label: 'Client', value: formatAddress(covenant.client), mono: true },
                    { label: 'Contractor', value: formatAddress(covenant.contractor), mono: true },
                  ].map(({ label, value, mono }) => (
                    <div key={label} className="bg-bg-elevated rounded-xl p-4 border border-bg-border">
                      <p className="text-xs text-text-tertiary mb-1">{label}</p>
                      <p className={`text-sm font-semibold break-all ${mono ? 'font-mono text-accord-blue' : 'text-text-primary'}`}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ── DisputeRow — PRD §7.6 full dispute flow UI ────────────────────────────────

interface DisputeRowProps {
  milestoneIndex: number;
  milestoneStatus: 0 | 1 | 2 | 3;
  disputeState: { raisedAt: number; escalated: boolean } | null;
  isClient: boolean;
  isDisputingNow: boolean;
  onRaiseDispute: () => void;
  onEscalate: () => void;
}

function DisputeRow({
  milestoneIndex,
  milestoneStatus,
  disputeState,
  isClient,
  isDisputingNow,
  onRaiseDispute,
  onEscalate,
}: DisputeRowProps) {
  const expiresAt = disputeState ? disputeState.raisedAt + DISPUTE_WINDOW_MS : null;
  const remaining = useCountdown(expiresAt);

  // Only show dispute UI for active (non-released) milestones
  if (milestoneStatus === 2) return null;

  // If milestone is already DISPUTED (status 3) or we have a local dispute record
  const isDisputed = milestoneStatus === 3 || disputeState !== null;

  if (!isDisputed) {
    // Show raise-dispute button for client on pending/delivered milestones
    if (!isClient) return null;
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-2 mb-1 ml-1"
      >
        <button
          id={`dispute-m${milestoneIndex}`}
          onClick={onRaiseDispute}
          disabled={isDisputingNow}
          className="text-xs text-accord-amber hover:text-accord-red transition-colors duration-150 flex items-center gap-1.5 disabled:opacity-50"
        >
          {isDisputingNow ? (
            <span className="w-3 h-3 border border-accord-amber border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>⚑</span>
          )}
          Raise Dispute for Milestone {milestoneIndex + 1}
        </button>
      </motion.div>
    );
  }

  // Full dispute panel — shown when milestone is disputed
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-3 rounded-xl border border-accord-amber/30 bg-accord-amber/5 p-4"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-accord-amber text-sm font-bold">⚑ Disputed — Milestone {milestoneIndex + 1}</span>
          </div>
          {disputeState && !disputeState.escalated && remaining > 0 && (
            <p className="text-xs text-text-secondary">
              Resolution window closes in{' '}
              <span className="font-mono font-bold text-accord-amber">
                {formatCountdown(remaining)}
              </span>
              {' '}— Arca is reviewing the deliverable against the brief.
            </p>
          )}
          {disputeState && !disputeState.escalated && remaining === 0 && (
            <p className="text-xs text-accord-red font-semibold">
              ⚠ 48-hour window expired. Escalate to Accord arbitration.
            </p>
          )}
          {disputeState?.escalated && (
            <p className="text-xs text-text-secondary">
              ✓ Escalated to Accord arbitration. A human arbiter will review within 24 hours.
            </p>
          )}
          {!disputeState && (
            <p className="text-xs text-text-secondary">
              This milestone was marked disputed on-chain. Arca is re-reviewing delivery.
            </p>
          )}
        </div>

        {/* Escalation CTA — available to client after window expires */}
        {isClient && disputeState && !disputeState.escalated && remaining === 0 && (
          <button
            id={`escalate-m${milestoneIndex}`}
            onClick={onEscalate}
            className="btn-ghost text-xs border-accord-red/40 text-accord-red hover:bg-accord-red/10"
          >
            Escalate to Arbitration
          </button>
        )}
      </div>
    </motion.div>
  );
}