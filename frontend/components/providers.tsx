'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider, createNetworkConfig } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { Toaster } from 'react-hot-toast';
import { useState } from 'react';

const { networkConfig } = createNetworkConfig({
  testnet: { url: getFullnodeUrl('testnet') },
  mainnet: { url: getFullnodeUrl('mainnet') },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 2 },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider
        networks={networkConfig}
        defaultNetwork={(process.env.NEXT_PUBLIC_SUI_NETWORK as 'testnet' | 'mainnet') ?? 'testnet'}
      >
        <WalletProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#0E1526',
                color: '#E2E8F5',
                border: '1px solid #1E2D4A',
                borderRadius: '12px',
                fontSize: '14px',
              },
              success: {
                iconTheme: { primary: '#10B981', secondary: '#0E1526' },
              },
              error: {
                iconTheme: { primary: '#EF4444', secondary: '#0E1526' },
              },
            }}
          />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
