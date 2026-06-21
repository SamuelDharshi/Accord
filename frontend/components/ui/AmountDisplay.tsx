'use client';

/**
 * AmountDisplay — Always shows USD to users.
 * Converts USDSUI base units (6 decimals) to formatted USD string.
 * Never shows "SUI", "gas", or raw token amounts.
 */

interface AmountDisplayProps {
  amountUsdsui: number | bigint;
  className?: string;
  showSymbol?: boolean;
  /** If true, renders in JetBrains Mono */
  mono?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-3xl font-extrabold',
};

export function AmountDisplay({
  amountUsdsui,
  className = '',
  showSymbol = true,
  mono = true,
  size = 'md',
}: AmountDisplayProps) {
  const num = typeof amountUsdsui === 'bigint' ? Number(amountUsdsui) : amountUsdsui;
  const usd = (num / 1_000_000).toFixed(2);

  return (
    <span
      className={`${SIZE_CLASSES[size]} ${mono ? 'font-mono' : ''} ${className}`}
    >
      {showSymbol && '$'}{usd}
    </span>
  );
}

/**
 * InlineAmount — Compact inline amount for use within text.
 */
export function InlineAmount({ amountUsdsui }: { amountUsdsui: number | bigint }) {
  return (
    <AmountDisplay
      amountUsdsui={amountUsdsui}
      className="text-accord-emerald font-semibold"
      size="sm"
    />
  );
}
