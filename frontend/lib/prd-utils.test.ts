/**
 * Accord Frontend — PRD Module Compliance Tests
 * Three test cases per PRD frontend module (offline).
 */

import { describe, it, expect } from 'vitest';
import {
  formatUsdsuiAsUsd,
  maskWalletAddress,
  PRD_ROUTES,
  getWalrusViewUrl,
} from './prd-utils';
import fs from 'fs';
import path from 'path';

// ═════════════════════════════════════════════════════════════════════════════
// PRD 6 — Zero Crypto Surface / AmountDisplay
// ═════════════════════════════════════════════════════════════════════════════

describe('[PRD 6] AmountDisplay — Zero Crypto UX', () => {
  it('TC-6-1: formats USDSUI base units as USD dollars (never shows SUI/gas)', () => {
    expect(formatUsdsuiAsUsd(500_000_000)).toBe('$500.00');
    expect(formatUsdsuiAsUsd(150_000_000)).toBe('$150.00');
    expect(formatUsdsuiAsUsd(BigInt(1500000))).toBe('$1.50');
  });

  it('TC-6-2: WalletMask truncates hex addresses per PRD (no full address shown)', () => {
    const addr = '0x916c7accd3308e4a8ec896b51b2a0bbcd510abff0579c059455b7e30d147f05a';
    const masked = maskWalletAddress(addr);
    expect(masked).not.toBe(addr);
    expect(masked).toMatch(/^0x916c…/);
    expect(masked.length).toBeLessThan(20);
  });

  it('TC-6-3: all PRD-required routes have corresponding page files in app/', () => {
    const appDir = path.join(process.cwd(), 'app');
    const routeFiles: Record<string, string> = {
      '/': 'page.tsx',
      '/dashboard': 'dashboard/page.tsx',
      '/covenant/new': 'covenant/new/page.tsx',
      '/covenant/[id]': 'covenant/[id]/page.tsx',
      '/proof/[id]': 'proof/[id]/page.tsx',
      '/profile/[handle]': 'profile/[handle]/page.tsx',
    };
    for (const route of PRD_ROUTES) {
      const rel = routeFiles[route];
      expect(fs.existsSync(path.join(appDir, rel)), `Missing page for ${route}`).toBe(true);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PRD 8.3 — Walrus Blob Storage (frontend deliverable upload)
// ═════════════════════════════════════════════════════════════════════════════

describe('[PRD 8.3] Walrus Integration — Frontend', () => {
  it('TC-8.3-1: Walrus view URL uses correct aggregator /v1/blobs/ path', () => {
    const url = getWalrusViewUrl('4bVGMSMqyPyZsHoFDXqSxSLJJaYoqBpj2mXsXi9GHvDQ');
    expect(url).toBe(
      'https://aggregator.walrus-testnet.walrus.space/v1/blobs/4bVGMSMqyPyZsHoFDXqSxSLJJaYoqBpj2mXsXi9GHvDQ',
    );
  });

  it('TC-8.3-2: frontend walrus.ts uses /v1/blobs publisher endpoint (not deprecated /v1/store)', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'lib', 'walrus.ts'), 'utf-8');
    expect(src).toContain('/v1/blobs');
    expect(src).not.toContain('/v1/store');
  });

  it('TC-8.3-3: PRD design system colors defined in globals.css', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf-8');
    expect(css).toMatch(/#4[Ff]8[Ee][Ff]7|accord-blue/i);
    expect(css).toMatch(/#8[Bb]5[Cc][Ff]6|accord-violet/i);
    expect(css).toMatch(/#10[Bb]981|accord-emerald/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PRD 7.1 — Covenant Creation UI components exist
// ═════════════════════════════════════════════════════════════════════════════

describe('[PRD 7.1] Covenant Creation Components', () => {
  it('TC-7.1-1: CovenantCard component exists', () => {
    expect(
      fs.existsSync(path.join(process.cwd(), 'components', 'covenant', 'CovenantCard.tsx')),
    ).toBe(true);
  });

  it('TC-7.1-2: MilestoneTimeline component exists', () => {
    expect(
      fs.existsSync(path.join(process.cwd(), 'components', 'covenant', 'MilestoneTimeline.tsx')),
    ).toBe(true);
  });

  it('TC-7.1-3: DeliveryUpload component exists for contractor Walrus upload flow', () => {
    expect(
      fs.existsSync(path.join(process.cwd(), 'components', 'covenant', 'DeliveryUpload.tsx')),
    ).toBe(true);
  });
});
