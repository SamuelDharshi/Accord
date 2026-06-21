/**
 * Accord Frontend — Sui Client Setup
 * Configures the SuiClient for testnet/mainnet and exports shared constants.
 */
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

export const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') as
  | 'mainnet'
  | 'testnet'
  | 'devnet'
  | 'localnet';

export const suiClient = new SuiClient({
  url: getFullnodeUrl(NETWORK),
});

export const ACCORD_PACKAGE_ID = process.env.NEXT_PUBLIC_ACCORD_PACKAGE_ID ?? '';
export const AGENT_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://localhost:3001';
export const WALRUS_AGGREGATOR_URL =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ??
  'https://aggregator.walrus-testnet.walrus.space';
export const WALRUS_PUBLISHER_URL =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ??
  'https://publisher.walrus-testnet.walrus.space';

export function getExplorerUrl(type: 'tx' | 'object', id: string): string {
  const base =
    NETWORK === 'mainnet'
      ? 'https://suiscan.xyz/mainnet'
      : `https://suiscan.xyz/${NETWORK}`;
  return `${base}/${type === 'tx' ? 'tx' : 'object'}/${id}`;
}

export function formatAddress(address: string): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatUsdsui(amount: bigint | number, decimals = 6): string {
  const n = typeof amount === 'bigint' ? Number(amount) : amount;
  return `$${(n / Math.pow(10, decimals)).toFixed(2)}`;
}
