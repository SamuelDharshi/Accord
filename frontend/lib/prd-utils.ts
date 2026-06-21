/**
 * Pure helpers for PRD UX requirements — testable without React/DOM.
 */

/** PRD 6: Always show USD to users (USDSUI base units → display dollars). */
export function formatUsdsuiAsUsd(amountUsdsui: number | bigint): string {
  const num = typeof amountUsdsui === 'bigint' ? Number(amountUsdsui) : amountUsdsui;
  return `$${(num / 1_000_000).toFixed(2)}`;
}

/** PRD 6: Never expose full wallet address — truncate for debug views only. */
export function maskWalletAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** PRD 6: Required application routes per UX architecture. */
export const PRD_ROUTES = [
  '/',
  '/dashboard',
  '/covenant/new',
  '/covenant/[id]',
  '/proof/[id]',
  '/profile/[handle]',
] as const;

export function getWalrusViewUrl(
  blobId: string,
  aggregatorBase = 'https://aggregator.walrus-testnet.walrus.space',
): string {
  return `${aggregatorBase}/v1/blobs/${blobId}`;
}
