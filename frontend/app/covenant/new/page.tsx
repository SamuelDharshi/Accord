'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { WalletMask } from '@/components/ui/WalletMask';
import { AmountDisplay } from '@/components/ui/AmountDisplay';
import { ArcaChat, type ChatMessage } from '@/components/covenant/ArcaChat';
import { Transaction } from '@mysten/sui/transactions';
import { suiClient, ACCORD_PACKAGE_ID, getExplorerUrl, AGENT_API_URL } from '@/lib/sui-client';
import { getZkLoginSession, buildZkLoginSignature } from '@/lib/zklogin';
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ParsedMilestone {
  description: string;
  percentageBps: number;
}

interface ParsedCovenant {
  title: string;
  totalAmountUsd: number;
  milestones: ParsedMilestone[];
  isConfidential: boolean;
  contractorEmail?: string;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NewCovenantPage() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'arca',
      content:
        "Hi! I'm Arca. Describe the work agreement you'd like to create — include the total amount, what needs to be delivered, and how you want to split payments. I'll structure it for you.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedCovenant, setParsedCovenant] = useState<ParsedCovenant | null>(null);
  const [step, setStep] = useState<'chat' | 'preview' | 'creating' | 'done'>('chat');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // ── Parse covenant from natural language (calls agent API) ────────────────

  const parseCovenantFromInput = async (userText: string): Promise<ParsedCovenant | null> => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_AGENT_API_URL}/parse-covenant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: userText }),
      });
      if (res.ok) {
        return (await res.json()) as ParsedCovenant;
      }
    } catch (e) {
      console.warn("Agent parsing failed, falling back to local extraction", e);
    }
    // Fallback: client-side extraction for demo
    return extractCovenantLocally(userText);
  };

  // Simple local extraction fallback for demos without a live agent.
  const extractCovenantLocally = (text: string): ParsedCovenant => {
    // Match any sequence of digits representing the amount, with or without $ prefix/suffix
    const digitsMatch = text.match(/\b\d+(?:,\d+)?\b/);
    const totalAmount = digitsMatch ? parseInt(digitsMatch[0].replace(/,/g, ''), 10) : 500;
    
    let title = "Accord Agreement";
    if (text.toLowerCase().includes("design a logo") || text.toLowerCase().includes("logo")) {
      title = "Logo Design Project";
    } else if (text.length > 5) {
      title = text.slice(0, 60).trim() + (text.length > 60 ? '…' : '');
    }

    return {
      title,
      totalAmountUsd: totalAmount,
      milestones: [
        { description: 'Initial Draft Delivery', percentageBps: 5000 },
        { description: 'Final Artifact Delivery', percentageBps: 5000 },
      ],
      isConfidential: false,
    };
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userMsg: ChatMessage = { role: 'user', content: input, timestamp: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setIsProcessing(true);

    // Parse the covenant from the user's message.
    const parsed = await parseCovenantFromInput(userMsg.content);

    if (parsed) {
      setParsedCovenant(parsed);
      const arcaMsg: ChatMessage = {
        role: 'arca',
        content: `I've structured your agreement. Here's what I extracted — review and edit as needed before we create it on-chain.`,
        timestamp: Date.now(),
      };
      setMessages((m) => [...m, arcaMsg]);
      setStep('preview');
    } else {
      const arcaMsg: ChatMessage = {
        role: 'arca',
        content: `I need a bit more detail. Could you specify the total amount, what needs to be delivered for each milestone, and how you'd like to split the payments?`,
        timestamp: Date.now(),
      };
      setMessages((m) => [...m, arcaMsg]);
    }

    setIsProcessing(false);
  };

  const handleMilestoneEdit = (idx: number, field: keyof ParsedMilestone, value: string | number) => {
    if (!parsedCovenant) return;
    const updated = [...parsedCovenant.milestones];
    (updated[idx] as unknown as Record<string, unknown>)[field] = value;
    setParsedCovenant({ ...parsedCovenant, milestones: updated });
  };

  const totalBps = parsedCovenant?.milestones.reduce((s, m) => s + m.percentageBps, 0) ?? 0;
  const bpsValid = totalBps === 10000;

  // Auto-normalize milestone BPS so they sum to exactly 10000
  const normalizeMilestones = () => {
    if (!parsedCovenant || bpsValid) return;
    const count = parsedCovenant.milestones.length;
    if (count === 0) return;
    const even = Math.floor(10000 / count);
    const remainder = 10000 - even * count;
    const normalized = parsedCovenant.milestones.map((m, i) => ({
      ...m,
      percentageBps: even + (i === count - 1 ? remainder : 0),
    }));
    setParsedCovenant({ ...parsedCovenant, milestones: normalized });
  };

  // Load a pre-filled demo covenant so users can skip the chat
  const loadDemoCovenant = () => {
    setParsedCovenant({
      title: 'Logo Design Project',
      totalAmountUsd: 500,
      milestones: [
        { description: 'Draft concepts (3 options)', percentageBps: 3000 },
        { description: 'Revision round', percentageBps: 4000 },
        { description: 'Final delivery + source files', percentageBps: 3000 },
      ],
      isConfidential: false,
    });
    setStep('preview');
  };

  const handleCreateCovenant = async () => {
    if (!parsedCovenant) return;
    // Auto-normalize milestones to exactly 100% before submitting
    if (!bpsValid) {
      normalizeMilestones();
      // Small delay so state updates before we continue
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!ACCORD_PACKAGE_ID) {
      alert('Accord package ID not configured. Set NEXT_PUBLIC_ACCORD_PACKAGE_ID in your environment.');
      return;
    }
    setStep('creating');

    try {
      // ── Step 1: Get user's zkLogin session or standard wallet ─────────────
      const session = getZkLoginSession();
      if (!session && !account) {
        alert('Please sign in with Google or connect a Sui wallet first to create a covenant.');
        setStep('preview');
        return;
      }

      const userAddress = session ? session.address : account!.address;

      // ── Step 2: Find user's USDSUI coin (auto-faucet if empty) ─────────
      const coinType = `${ACCORD_PACKAGE_ID}::usdsui::USDSUI`;
      setStatusMsg('Checking your USDSUI balance…');
      const fetchCoins = () => suiClient.getCoins({ owner: userAddress, coinType });
      let coinsRes = await fetchCoins();

      if (coinsRes.data.length === 0) {
        // Auto-mint via faucet so the user doesn't hit a dead end
        setStatusMsg('No USDSUI found — requesting $10,000 from faucet…');
        const agentUrl = process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://localhost:3001';
        const faucetRes = await fetch(`${agentUrl}/faucet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipient: userAddress }),
        });
        if (!faucetRes.ok) {
          const errText = await faucetRes.text();
          throw new Error(`Faucet failed: ${errText}. Please use the wallet menu to request tokens manually.`);
        }
        // Poll up to 15 times (30 seconds) waiting for the coin to be indexed
        setStatusMsg('Faucet sent! Waiting for on-chain confirmation…');
        for (let attempt = 0; attempt < 15; attempt++) {
          await new Promise((r) => setTimeout(r, 2000));
          setStatusMsg(`Confirming… (${attempt + 1}/15)`);
          coinsRes = await fetchCoins();
          if (coinsRes.data.length > 0) break;
        }
        if (coinsRes.data.length === 0) {
          throw new Error('Coins not indexed yet — click Create again in a few seconds.');
        }
      }

      setStatusMsg('Building covenant transaction…');
      const paymentCoinId = coinsRes.data[0]!.coinObjectId;

      // ── Step 3: Build the create_covenant PTB ───────────────────────────
      const escrowAmount = BigInt(Math.round(parsedCovenant.totalAmountUsd * 1_000_000));
      const milestoneDescriptions = parsedCovenant.milestones.map((m) => m.description);
      const milestonePercentages = parsedCovenant.milestones.map((m) => m.percentageBps);

      const tx = new Transaction();

      // Split the payment amount off the user's USDSUI coin (returns a temporary Coin object)
      const [escrowCoin] = tx.splitCoins(tx.object(paymentCoinId), [tx.pure.u64(escrowAmount)]);

      // Call create_covenant on the Accord package
      // NOTE: contract now requires `protocol_treasury` as the 7th argument (0.5% fee recipient).
      // For hackathon: use the user's address as treasury (fees go back to the same user).
      // In production: set this to the Accord treasury multi-sig address.
      const PROTOCOL_TREASURY = userAddress;
      tx.moveCall({
        target: `${ACCORD_PACKAGE_ID}::covenant::create_covenant`,
        arguments: [
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(parsedCovenant.title))),
          tx.pure.address(userAddress), // contractor = sender for self-covenant
          tx.pure.vector(
            'vector<u8>',
            milestoneDescriptions.map((d) => Array.from(new TextEncoder().encode(d))),
          ),
          tx.pure.vector('u64', milestonePercentages),
          escrowCoin,
          tx.pure.bool(parsedCovenant.isConfidential),
          tx.pure.address(PROTOCOL_TREASURY), // 0.5% fee recipient
        ],
      });

      tx.setSender(userAddress);

      let result;
      if (session) {
        // ── Step 4: Build transaction bytes (zkLogin) ────────────────────────
        const builtBytes = await tx.build({ client: suiClient });
        const txBytesBase64 = Buffer.from(builtBytes).toString('base64');

        // ── Step 5: Sign with ephemeral keypair (zkLogin) ─────────────────
        const sigResult = await session.ephemeralKeypair.signTransaction(builtBytes);
        const zkLoginSig = buildZkLoginSignature(session, sigResult.signature as string);

        // ── Step 6: Request gas sponsorship from the agent sponsor service ─
        const sponsorRes = await fetch(`${AGENT_API_URL}/sponsor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            txBytes: txBytesBase64,
            sender: session.address,
          }),
        });

        if (!sponsorRes.ok) {
          const errText = await sponsorRes.text();
          throw new Error(`Sponsor service error: ${errText}`);
        }
        const { sponsorSignature } = await sponsorRes.json() as { sponsorSignature: string };

        // ── Step 7: Execute the transaction on testnet ───────────────────────
        result = await suiClient.executeTransactionBlock({
          transactionBlock: Buffer.from(txBytesBase64, 'base64'),
          signature: [zkLoginSig, sponsorSignature],
          options: {
            showEffects: true,
            showEvents: true,
            showObjectChanges: true,
          },
        });
      } else {
        // ── Standard Wallet Execution ───────────────────────────────────────
        const txResult = await signAndExecuteTransaction({
          transaction: tx as any,
        });
        result = await suiClient.waitForTransaction({
          digest: txResult.digest,
          options: {
            showEffects: true,
            showEvents: true,
            showObjectChanges: true,
          },
        });
      }

      if (result.effects?.status?.status !== 'success') {
        throw new Error(result.effects?.status?.error ?? 'Transaction failed');
      }

      // ── Step 8: Find the new Covenant object ID ───────────────────────
      const objectChanges = result.objectChanges ?? [];
      const newCovenant = objectChanges.find(
        (c) => (c as Record<string, unknown>).type === 'created' &&
          String((c as Record<string, unknown>).objectType ?? '').includes('Covenant'),
      );
      const covenantId = newCovenant
        ? String((newCovenant as Record<string, unknown>).objectId)
        : null;

      if (covenantId) {
        // Navigate to the new covenant page
        window.location.href = `/covenant/${covenantId}`;
      } else {
        // Fallback: still show success page
        setStep('done');
      }

      console.info(`[Accord] Covenant created: ${getExplorerUrl('tx', result.digest)}`);
    } catch (err) {
      console.error('[Accord] Covenant creation failed:', err);
      alert(`Failed to create covenant: ${(err as Error).message}`);
      setStep('preview');
    } finally {
      setStatusMsg(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg-deep flex flex-col">
      {/* ── Grid bg ─── */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(79,142,247,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(79,142,247,0.03) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* ── Navbar ─── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto w-full border-b border-bg-border">
        <Link href="/dashboard" className="text-lg font-extrabold tracking-tight text-gradient-accord">
          ACCORD
        </Link>
        <WalletMask />
      </nav>

      <main className="relative z-10 flex-1 max-w-6xl mx-auto w-full px-6 py-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ── Left: ArcaChat component ─── */}
        <div className="flex flex-col">
          <div className="mb-5">
            <h1 className="text-2xl font-extrabold tracking-tight mb-1">New Covenant</h1>
            <p className="text-text-secondary text-sm">
              Describe your work agreement in plain English. Arca will structure it.
            </p>
          </div>

          <ArcaChat
            messages={messages}
            input={input}
            isProcessing={isProcessing}
            disabled={step !== 'chat'}
            placeholder='Try: "Pay $500 to design a logo. 30% on draft, 40% on revision, 30% final."'
            onInputChange={setInput}
            onSend={handleSend}
          />
        </div>

        {/* ── Right: Structured Preview ─── */}
        <div className="flex flex-col">
          <div className="mb-5">
            <h2 className="text-2xl font-extrabold tracking-tight mb-1">Covenant Preview</h2>
            <p className="text-text-secondary text-sm">
              Review and edit the extracted terms before creating.
            </p>
          </div>

          <AnimatePresence mode="wait">
            {step === 'chat' && !parsedCovenant && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="card flex-1 flex flex-col items-center justify-center p-12 text-center gap-6"
              >
                <div>
                  <div className="text-4xl mb-4">✍️</div>
                  <p className="text-text-secondary text-sm mb-2">
                    Describe your agreement to the left and Arca will structure it here.
                  </p>
                  <p className="text-xs text-text-tertiary">— or —</p>
                </div>
                <button
                  id="load-demo-covenant"
                  onClick={loadDemoCovenant}
                  className="btn-ghost text-sm flex items-center gap-2"
                >
                  ⚡ Try a Demo Covenant
                </button>
              </motion.div>
            )}

            {parsedCovenant && step !== 'done' && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
                className="card flex-1 p-6 flex flex-col gap-5"
              >
                {/* Title */}
                <div>
                  <label className="text-xs text-text-secondary font-semibold uppercase tracking-widest mb-1.5 block">
                    Covenant Title
                  </label>
                  <input
                    id="covenant-title"
                    type="text"
                    value={parsedCovenant.title}
                    onChange={(e) =>
                      setParsedCovenant({ ...parsedCovenant, title: e.target.value })
                    }
                    className="input text-sm font-semibold"
                  />
                </div>

                {/* Total amount */}
                <div>
                  <label className="text-xs text-text-secondary font-semibold uppercase tracking-widest mb-1.5 block">
                    Total Escrow Amount
                  </label>
                  <div className="input flex items-center gap-2">
                    <span className="text-text-secondary">$</span>
                    <input
                      id="covenant-amount"
                      type="number"
                      value={parsedCovenant.totalAmountUsd}
                      onChange={(e) =>
                        setParsedCovenant({
                          ...parsedCovenant,
                          totalAmountUsd: Number(e.target.value),
                        })
                      }
                      className="flex-1 bg-transparent outline-none text-sm font-mono font-semibold"
                    />
                    <span className="text-xs text-text-tertiary font-mono">USDSUI</span>
                  </div>
                </div>

                {/* Milestones */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="text-xs text-text-secondary font-semibold uppercase tracking-widest">
                      Milestones
                    </label>
                    <span
                      className={`text-xs font-mono font-bold ${
                        bpsValid ? 'text-accord-emerald' : 'text-accord-red'
                      }`}
                    >
                      {(totalBps / 100).toFixed(0)}% / 100%
                    </span>
                  </div>
                  <div className="space-y-3">
                    {parsedCovenant.milestones.map((m, i) => (
                      <div key={i} className="bg-bg-elevated rounded-xl border border-bg-border p-4">
                        <div className="flex gap-3">
                          <div className="w-6 h-6 rounded-full bg-accord-blue/20 text-accord-blue text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {i + 1}
                          </div>
                          <div className="flex-1 space-y-2">
                            <input
                              type="text"
                              value={m.description}
                              onChange={(e) => handleMilestoneEdit(i, 'description', e.target.value)}
                              className="w-full bg-transparent border-b border-bg-border pb-1 text-sm text-text-primary outline-none focus:border-accord-blue transition-colors"
                              placeholder="Milestone description…"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min={500}
                                max={10000}
                                step={500}
                                value={m.percentageBps}
                                onChange={(e) =>
                                  handleMilestoneEdit(i, 'percentageBps', parseInt(e.target.value, 10))
                                }
                                className="flex-1 accent-accord-blue"
                              />
                              <span className="text-xs font-mono font-semibold text-accord-blue w-12 text-right">
                                {(m.percentageBps / 100).toFixed(0)}%
                              </span>
                              <span className="text-xs text-text-tertiary font-mono">
                                = $
                                {(
                                  (parsedCovenant.totalAmountUsd * m.percentageBps) /
                                  10000
                                ).toFixed(0)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Confidentiality toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Private Covenant</p>
                    <p className="text-xs text-text-secondary">
                      Hides amounts using Confidential Transfers
                    </p>
                  </div>
                  <button
                    id="toggle-confidential"
                    onClick={() =>
                      setParsedCovenant({
                        ...parsedCovenant,
                        isConfidential: !parsedCovenant.isConfidential,
                      })
                    }
                    className={`w-11 h-6 rounded-full transition-colors duration-200 relative ${
                      parsedCovenant.isConfidential ? 'bg-accord-violet' : 'bg-bg-border'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
                        parsedCovenant.isConfidential ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Create button */}
                <button
                  id="create-covenant"
                  onClick={handleCreateCovenant}
                  disabled={step === 'creating'}
                  className="btn-primary py-3.5 w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {step === 'creating' ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      />
                      {statusMsg ?? 'Creating Covenant…'}
                    </>
                  ) : (
                    <>
                      🔐 Create &amp; Fund Covenant
                      <span className="font-mono ml-1">${parsedCovenant.totalAmountUsd}</span>
                    </>
                  )}
                </button>
                {!bpsValid && (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-accord-red">
                      Percentages must sum to 100% (currently {(totalBps / 100).toFixed(0)}%)
                    </p>
                    <button
                      onClick={normalizeMilestones}
                      className="text-xs text-accord-blue hover:underline whitespace-nowrap"
                    >
                      Auto-fix
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {step === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="card flex-1 flex flex-col items-center justify-center gap-6 p-12 text-center"
                style={{ border: '1px solid rgba(16,185,129,0.3)' }}
              >
                <motion.div
                  initial={{ scale: 0, rotate: -15 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', bounce: 0.5, delay: 0.2 }}
                  className="w-20 h-20 rounded-full border-2 border-accord-emerald flex items-center justify-center text-4xl"
                  style={{ background: 'rgba(16,185,129,0.1)' }}
                >
                  ✓
                </motion.div>
                <div>
                  <h3 className="text-xl font-extrabold mb-2 text-accord-emerald">
                    Covenant Created!
                  </h3>
                  <p className="text-text-secondary text-sm mb-6">
                    Share the link with your contractor. They sign in with Google and see the milestone timeline.
                  </p>
                  <div className="bg-bg-elevated border border-bg-border rounded-xl px-4 py-3 font-mono text-xs text-accord-blue break-all">
                    accord.xyz/c/rainbow-tiger-7821
                  </div>
                </div>
                <Link href="/dashboard" className="btn-ghost">
                  Back to Dashboard
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
