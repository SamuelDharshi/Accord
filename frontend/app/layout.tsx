import type { Metadata } from 'next';
import { DM_Sans, JetBrains_Mono } from 'next/font/google';
import '@mysten/dapp-kit/dist/index.css';
import './globals.css';
import { Providers } from '@/components/providers';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Accord — Work. Verify. Pay. Automatically.',
  description:
    'Accord is the autonomous work verification and payment protocol. An AI agent verifies milestone delivery and releases escrow payments instantly — no middlemen, zero fees.',
  keywords: ['accord', 'sui', 'walrus', 'freelance', 'autonomous', 'payment', 'escrow'],
  authors: [{ name: 'Accord Protocol' }],
  openGraph: {
    title: 'Accord — Autonomous Work & Payment Protocol',
    description:
      'Your AI agent verifies delivery, releases payment, generates proof. In 0.4 seconds.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-bg-deep text-text-primary font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
