'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { handleOAuthCallback } from '@/lib/zklogin';
import { motion } from 'framer-motion';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'processing' | 'error'>('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const fragment = window.location.hash;
    if (!fragment) {
      setStatus('error');
      setErrorMsg('No authentication token received.');
      return;
    }

    handleOAuthCallback(fragment)
      .then(() => {
        router.replace('/dashboard');
      })
      .catch((err: Error) => {
        setStatus('error');
        setErrorMsg(err.message);
      });
  }, [router]);

  return (
    <div className="min-h-screen bg-bg-deep flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card p-12 text-center max-w-sm w-full"
      >
        {status === 'processing' ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="w-12 h-12 border-2 border-accord-violet/30 border-t-accord-violet rounded-full mx-auto mb-6"
            />
            <h2 className="font-extrabold text-lg mb-2">Setting up your wallet</h2>
            <p className="text-text-secondary text-sm">
              Arca is creating your non-custodial Sui wallet from your Google account…
            </p>
          </>
        ) : (
          <>
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="font-extrabold text-lg mb-2 text-accord-red">Authentication Error</h2>
            <p className="text-text-secondary text-sm mb-6">{errorMsg}</p>
            <button
              onClick={() => router.replace('/')}
              className="btn-ghost text-sm"
            >
              Try Again
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
