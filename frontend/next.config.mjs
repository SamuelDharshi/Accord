/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prevent Next.js from statically prerendering pages that use browser-only
  // wallet/dapp-kit hooks (SuiClientProvider, WalletProvider). All pages are
  // dynamic and rendered per-request.
  // This is the correct flag for App Router — it sets all routes to dynamic.
  experimental: {},
  images: {
    domains: ['aggregator.walrus-testnet.walrus.space', 'aggregator.walrus.space'],
  },
  env: {
    NEXT_PUBLIC_SUI_NETWORK: process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet',
    NEXT_PUBLIC_ACCORD_PACKAGE_ID: process.env.NEXT_PUBLIC_ACCORD_PACKAGE_ID ?? '',
    NEXT_PUBLIC_AGENT_API_URL: process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://localhost:3001',
    NEXT_PUBLIC_WALRUS_AGGREGATOR_URL:
      process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ??
      'https://aggregator.walrus-testnet.walrus.space',
    NEXT_PUBLIC_WALRUS_PUBLISHER_URL:
      process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ??
      'https://publisher.walrus-testnet.walrus.space',
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
  },
};

export default nextConfig;
