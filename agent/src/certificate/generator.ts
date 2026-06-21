/**
 * Accord Agent — PDF Proof Certificate Generator
 *
 * Generates a premium, styled PDF proof certificate for each released milestone.
 * The PDF is archived to Walrus and its blob ID embedded in the on-chain
 * ProofCertificate object.
 *
 * Design mirrors the UI certificate: dark background, Accord colors, seal element.
 */

import PDFDocument from 'pdfkit';
import { getWalrusBlobUrl } from '../memory/walrus-memory.js';
import type { ProofMetadata } from './walrus-store.js';

// Accord brand colors (RGB normalized to 0–255).
const COLORS = {
  background: [8, 13, 26] as [number, number, number],
  surface: [14, 21, 38] as [number, number, number],
  border: [30, 45, 74] as [number, number, number],
  blue: [79, 142, 247] as [number, number, number],
  violet: [139, 92, 246] as [number, number, number],
  emerald: [16, 185, 129] as [number, number, number],
  textPrimary: [226, 232, 245] as [number, number, number],
  textSecondary: [123, 141, 176] as [number, number, number],
};

function hex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function formatUsdsui(amount: number): string {
  return `$${(amount / 1_000_000).toFixed(2)} USDSUI`;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Generates a complete proof certificate as a PDF Buffer.
 *
 * @param metadata       - Proof metadata from the on-chain event.
 * @param covenantTitle  - Human-readable covenant title.
 * @param milestoneDesc  - Description of the completed milestone.
 * @param deliverableBlobId - Walrus blob ID of the contractor's deliverable.
 * @param txDigest       - Sui transaction digest of the payment release.
 */
export function generateProofCertificate(
  metadata: ProofMetadata,
  covenantTitle: string,
  milestoneDesc: string,
  txDigest: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [800, 560],
        margin: 0,
        info: {
          Title: `Accord Proof Certificate — ${covenantTitle}`,
          Author: 'Accord Protocol (powered by Arca)',
          Subject: `Milestone ${metadata.milestoneIndex + 1} completion proof`,
          Keywords: 'accord,walrus,sui,proof,certificate',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = 800;
      const H = 560;

      // ── Background ─────────────────────────────────────────────────────────
      doc.rect(0, 0, W, H).fill(hex(COLORS.background));

      // ── Outer border glow (emerald) ────────────────────────────────────────
      doc
        .roundedRect(12, 12, W - 24, H - 24, 12)
        .lineWidth(1.5)
        .stroke(hex(COLORS.emerald));

      // ── Surface card area ──────────────────────────────────────────────────
      doc.roundedRect(28, 28, W - 56, H - 56, 8).fill(hex(COLORS.surface));

      // ── Top accent bar (gradient simulation — left blue, right violet) ─────
      doc.rect(28, 28, (W - 56) / 2, 4).fill(hex(COLORS.blue));
      doc.rect(28 + (W - 56) / 2, 28, (W - 56) / 2, 4).fill(hex(COLORS.violet));

      // ── Header: ACCORD logo + PROOF CERTIFICATE label ─────────────────────
      doc
        .fontSize(13)
        .fillColor(hex(COLORS.blue))
        .font('Helvetica-Bold')
        .text('ACCORD', 52, 52, { lineBreak: false });

      doc
        .fontSize(8)
        .fillColor(hex(COLORS.textSecondary))
        .font('Helvetica')
        .text('  ·  AUTONOMOUS WORK PROTOCOL', 52 + 64, 56, { lineBreak: false });

      doc
        .fontSize(9)
        .fillColor(hex(COLORS.emerald))
        .font('Helvetica-Bold')
        .text('✓ MILESTONE VERIFIED & PAID', W - 56 - 180, 54, {
          width: 180,
          align: 'right',
          lineBreak: false,
        });

      // ── Divider ─────────────────────────────────────────────────────────────
      doc
        .moveTo(52, 78)
        .lineTo(W - 52, 78)
        .lineWidth(0.5)
        .stroke(hex(COLORS.border));

      // ── Covenant title ──────────────────────────────────────────────────────
      doc
        .fontSize(22)
        .fillColor(hex(COLORS.textPrimary))
        .font('Helvetica-Bold')
        .text(covenantTitle, 52, 94, { width: W - 104, lineBreak: false });

      // ── Milestone label ─────────────────────────────────────────────────────
      doc
        .fontSize(10)
        .fillColor(hex(COLORS.textSecondary))
        .font('Helvetica')
        .text(`Milestone ${metadata.milestoneIndex + 1}: ${milestoneDesc}`, 52, 126, {
          width: W - 104,
        });

      // ── Amount (large display) ──────────────────────────────────────────────
      const amountStr = formatUsdsui(metadata.amountUsdsui);
      doc
        .fontSize(36)
        .fillColor(hex(COLORS.emerald))
        .font('Helvetica-Bold')
        .text(amountStr, 52, 158, { lineBreak: false });

      doc
        .fontSize(9)
        .fillColor(hex(COLORS.textSecondary))
        .font('Helvetica')
        .text('RELEASED', 52, 200);

      // ── Two-column metadata grid ────────────────────────────────────────────
      const col1X = 52;
      const col2X = W / 2 + 10;
      const rowY = [240, 280, 318];

      // Column 1: Client, Contractor, Issued
      renderField(doc, 'CLIENT', truncateAddress(metadata.clientAddress), col1X, rowY[0]);
      renderField(doc, 'CONTRACTOR', truncateAddress(metadata.contractorAddress), col1X, rowY[1]);
      renderField(
        doc,
        'ISSUED',
        new Date(metadata.issuedAt).toUTCString(),
        col1X,
        rowY[2],
      );

      // Column 2: Covenant ID, Deliverable Blob, TX Hash
      renderField(doc, 'COVENANT ID', truncate(metadata.covenantId, 28), col2X, rowY[0]);
      renderField(
        doc,
        'WALRUS BLOB (DELIVERABLE)',
        truncate(metadata.deliverableBlobId, 28),
        col2X,
        rowY[1],
      );
      renderField(doc, 'SUI TX DIGEST', truncate(txDigest, 28), col2X, rowY[2]);

      // ── Walrus blob URL (verifiable link) ──────────────────────────────────
      const verifyUrl = getWalrusBlobUrl(metadata.deliverableBlobId);
      doc
        .fontSize(8)
        .fillColor(hex(COLORS.textSecondary))
        .text('Verify deliverable on Walrus:', col1X, 358)
        .fillColor(hex(COLORS.blue))
        .text(verifyUrl, col1X, 370, { width: W - 104 });

      // ── Bottom divider ─────────────────────────────────────────────────────
      doc
        .moveTo(52, 398)
        .lineTo(W - 52, 398)
        .lineWidth(0.5)
        .stroke(hex(COLORS.border));

      // ── Seal / Stamp element (circle + checkmark) ──────────────────────────
      const sealX = W / 2;
      const sealY = 450;
      const sealR = 44;

      // Outer ring
      doc
        .circle(sealX, sealY, sealR)
        .lineWidth(2)
        .stroke(hex(COLORS.emerald));

      // Inner fill
      doc.circle(sealX, sealY, sealR - 6).fill(hex(COLORS.surface));

      // Checkmark
      doc
        .moveTo(sealX - 14, sealY)
        .lineTo(sealX - 4, sealY + 12)
        .lineTo(sealX + 16, sealY - 14)
        .lineWidth(3)
        .strokeColor(hex(COLORS.emerald))
        .stroke();

      // ── Footer disclaimer ─────────────────────────────────────────────────
      doc
        .fontSize(7)
        .fillColor(hex(COLORS.textSecondary))
        .text(
          'This certificate is cryptographically verified on the Sui blockchain and stored immutably on Walrus.',
          52,
          508,
          { width: W - 104, align: 'center' },
        );

      doc
        .fontSize(7)
        .fillColor(hex(COLORS.textSecondary))
        .text('accord.xyz  ·  Powered by Walrus & Sui', 52, 522, {
          width: W - 104,
          align: 'center',
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function renderField(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
) {
  doc
    .fontSize(7)
    .fillColor(hex(COLORS.textSecondary))
    .font('Helvetica-Bold')
    .text(label, x, y);
  doc
    .fontSize(10)
    .fillColor(hex(COLORS.textPrimary))
    .font('Helvetica')
    .text(value, x, y + 12, { width: 320, lineBreak: false });
}

function truncate(str: string, len: number): string {
  if (!str) return '—';
  if (str.length <= len) return str;
  return `${str.slice(0, len - 3)}…`;
}
