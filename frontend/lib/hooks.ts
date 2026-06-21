/**
 * Accord Frontend — On-Chain Data Hooks
 *
 * Replaces all DEMO_* data with real Sui blockchain queries.
 * Every hook fetches live on-chain state using @mysten/sui/client.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { suiClient, ACCORD_PACKAGE_ID } from './sui-client';
import type {
  SuiObjectData,
  SuiObjectResponse,
  SuiEvent,
} from '@mysten/sui/client';

// ─── Types matching Move structs ───────────────────────────────────────────────

export interface MilestoneData {
  description: string;
  percentageBps: number;
  status: 0 | 1 | 2 | 3; // 0=pending, 1=delivered, 2=released, 3=disputed
  walrusBlobId: string | null;
  deadlineEpoch: number | null;
}

export interface CovenantData {
  id: string;
  title: string;
  client: string;
  contractor: string;
  totalAmountUsdsui: bigint;
  milestones: MilestoneData[];
  createdAt: number;
  isConfidential: boolean;
}

export interface ProfileData {
  handle: string;
  address: string;
  totalCovenantsCompleted: number;
  totalValueUsdsui: bigint;
  totalDisputes: number;
  averageQualityScoreBps: number;
}

export interface ProofCertificateData {
  id: string;
  covenantId: string;
  milestoneIndex: number;
  client: string;
  contractor: string;
  amountUsdsui: bigint;
  walrusBlobId: string;
  walrusCertBlobId: string;
  issuedAtEpoch: number;
}

// ─── Parsing helpers ───────────────────────────────────────────────────────────

function parseBytesToString(bytes: unknown): string {
  if (Array.isArray(bytes)) {
    return new TextDecoder().decode(Uint8Array.from(bytes as number[]));
  }
  return String(bytes ?? '');
}

function parseBytesToAddress(bytes: unknown): string {
  const str = parseBytesToString(bytes);
  // If it's already a hex address, return it
  if (str.startsWith('0x')) return str;
  // Otherwise try converting from bytes
  try {
    const arr = Array.isArray(bytes) ? Uint8Array.from(bytes as number[]) : new TextEncoder().encode(str);
    return '0x' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return str;
  }
}

/**
 * Extracts a u64 value from a Balance struct returned by Sui RPC.
 * Balance<USDSUI> is serialized as { fields: { value: u64 }, type: "0x...::usdsui::USDSUI" }
 * or as { value: u64 } in some response formats.
 */
function extractBalanceValue(balanceObj: unknown): number {
  if (typeof balanceObj !== 'object' || balanceObj === null) return 0;
  const b = balanceObj as Record<string, unknown>;
  // Direct value field
  if (typeof b.value === 'number') return b.value;
  if (typeof b.value === 'string') return parseInt(b.value, 10);
  // Nested fields
  const fields = b.fields as Record<string, unknown> | undefined;
  if (fields) {
    if (typeof fields.value === 'number') return fields.value;
    if (typeof fields.value === 'string') return parseInt(fields.value, 10);
  }
  return 0;
}

function parseCovenantObject(obj: SuiObjectData): CovenantData | null {
  try {
    const fields = obj.content?.dataType === 'moveObject' ? obj.content.fields : null;
    if (!fields) return null;

    const f = fields as Record<string, unknown>;

    const milestonesRaw = f.milestones;
    const milestones: MilestoneData[] = [];

    if (Array.isArray(milestonesRaw)) {
      for (const m of milestonesRaw) {
        if (!m) continue;
        const rawM = m as Record<string, any>;
        const mf = (rawM.fields ? rawM.fields : rawM) as Record<string, any>;
        milestones.push({
          description: parseBytesToString(mf.description),
          percentageBps: Number(mf.percentage_bps),
          status: Number(mf.status) as 0 | 1 | 2 | 3,
          walrusBlobId: (mf.walrus_blob_id as { vec?: unknown[] })?.vec
            ? parseBytesToString((mf.walrus_blob_id as { vec: unknown[] }).vec[0])
            : null,
          deadlineEpoch: (mf.deadline_epoch as { vec?: number[] })?.vec?.[0] ?? null,
        });
      }
    }

    // remaining_escrow is Balance<USDSUI> — extract u64 value
    const balanceValue = extractBalanceValue(f.remaining_escrow);

    // original_escrow (immutable total) — used for display
    const originalValue = typeof f.original_escrow === 'number'
      ? f.original_escrow
      : typeof f.original_escrow === 'string'
        ? parseInt(f.original_escrow, 10)
        : balanceValue;

    return {
      id: obj.objectId,
      title: parseBytesToString(f.title),
      client: parseBytesToAddress(f.client),
      contractor: parseBytesToAddress(f.contractor),
      // Use original_escrow for display (total), fallback to remaining balance
      totalAmountUsdsui: BigInt(originalValue || balanceValue),
      milestones,
      // Sui epoch stored as u64 — convert to milliseconds for display
      createdAt: typeof f.created_at_epoch === 'number'
        ? Number(f.created_at_epoch) * 86400 * 1000
        : 0,
      isConfidential: Boolean(f.is_confidential),
    };
  } catch (err) {
    console.error('Failed to parse covenant object:', err);
    return null;
  }
}

function parseProfileObject(obj: SuiObjectData): ProfileData | null {
  try {
    const fields = obj.content?.dataType === 'moveObject' ? (obj.content.fields as Record<string, unknown>) : null;
    if (!fields) return null;

    return {
      handle: '', // derived from address
      address: obj.objectId,
      totalCovenantsCompleted: Number(fields.total_covenants_completed ?? 0),
      totalValueUsdsui: BigInt(Number(fields.total_value_released_usdsui ?? 0)),
      totalDisputes: Number(fields.total_disputes ?? 0),
      averageQualityScoreBps: Number(fields.average_quality_score_bps ?? 0),
    };
  } catch {
    return null;
  }
}

function parseProofCertificateObject(obj: SuiObjectData): ProofCertificateData | null {
  try {
    const fields = obj.content?.dataType === 'moveObject' ? (obj.content.fields as Record<string, unknown>) : null;
    if (!fields) return null;

    return {
      id: obj.objectId,
      covenantId: parseBytesToAddress(fields.covenant_id),
      milestoneIndex: Number(fields.milestone_index ?? 0),
      client: parseBytesToAddress(fields.client),
      contractor: parseBytesToAddress(fields.contractor),
      amountUsdsui: BigInt(Number(fields.amount_usdsui ?? 0)),
      walrusBlobId: parseBytesToString(fields.walrus_blob_id),
      walrusCertBlobId: parseBytesToString(fields.walrus_cert_blob_id),
      issuedAtEpoch: Number(fields.issued_at_epoch ?? 0),
    };
  } catch {
    return null;
  }
}

// ─── Event Parsing ───────────────────────────────────────────────────────────

/** Event shape emitted by covenant::create_covenant */
interface CovenantCreatedEvent {
  covenant_id: string; // hex string
  client: string;
  contractor: string;
  milestone_count: number;
  original_escrow: number;
}

/**
 * Extracts CovenantCreatedEvent data from a SuiEvent.
 * Handles both raw event BCS and parsed JSON event formats.
 */
function parseCreateCovenantEvent(event: SuiEvent): CovenantCreatedEvent | null {
  try {
    const type = event.type;
    if (!type.includes('::covenant::CovenantCreated')) return null;

    const parsed = event.parsedJson as Record<string, unknown> | undefined;
    if (!parsed) return null;

    return {
      covenant_id: String(parsed.covenant_id ?? parsed.covenantId ?? ''),
      client: String(parsed.client ?? ''),
      contractor: String(parsed.contractor ?? ''),
      milestone_count: Number(parsed.milestone_count ?? parsed.milestoneCount ?? 0),
      original_escrow: Number(parsed.original_escrow ?? parsed.originalEscrow ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * Extracts a hex object ID string from Sui RPC response values.
 * Handles: string IDs, nested { id: "0x..." } objects, and raw objects.
 */
function extractObjectId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.startsWith('0x') ? value : null;
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    // Nested object: { id: "0x..." }
    if (typeof o.id === 'string') return o.id.startsWith('0x') ? o.id : null;
    // Direct fields with objectId or address
    if (typeof o.objectId === 'string') return o.objectId.startsWith('0x') ? o.objectId : null;
  }
  return null;
}

// ─── useCovenant ───────────────────────────────────────────────────────────────

export function useCovenant(covenantId: string | null) {
  const [covenant, setCovenant] = useState<CovenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCovenant = useCallback(async () => {
    if (!covenantId || !ACCORD_PACKAGE_ID) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const resp: SuiObjectResponse = await suiClient.getObject({
        id: covenantId,
        options: { showContent: true },
      });

      const data = resp.data;
      if (!data) {
        setError('Covenant not found');
        setLoading(false);
        return;
      }

      const parsed = parseCovenantObject(data);
      if (!parsed) {
        setError('Failed to parse covenant data');
      } else {
        setCovenant(parsed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch covenant');
    } finally {
      setLoading(false);
    }
  }, [covenantId]);

  useEffect(() => {
    fetchCovenant();
  }, [fetchCovenant]);

  return { covenant, loading, error, refetch: fetchCovenant };
}

// ─── useOwnedCovenants ──────────────────────────────────────────────────────────

/**
 * Fetches all Covenant objects where the given address is the client or contractor.
 *
 * Strategy:
 * - Client: Query getOwnedObjects for ClientCap objects owned by the address, then
 *   fetch each linked Covenant object individually.
 * - Contractor: Query queryEvents for CovenantCreated events and filter by contractor.
 *   (Covenant is a shared object so getOwnedObjects returns nothing for contractors.)
 */
export function useOwnedCovenants(address: string | null, role: 'client' | 'contractor' | 'both') {
  const [covenants, setCovenants] = useState<CovenantData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCovenants = useCallback(async () => {
    if (!address || !ACCORD_PACKAGE_ID) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const covenantIds = new Set<string>();

      // ── CLIENT: use ClientCap objects ──────────────────────────────────────
      if (role === 'client' || role === 'both') {
        const clientCaps = await suiClient.getOwnedObjects({
          owner: address,
          filter: { StructType: `${ACCORD_PACKAGE_ID}::covenant::ClientCap` },
          options: { showContent: true },
        });

        await Promise.all(
          clientCaps.data.map(async (obj) => {
            if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return;
            const fields = (obj.data.content as { fields: Record<string, unknown> }).fields;
            if (!fields) return;
            // covenant_id field stores the ID
            const covId = extractObjectId(fields.covenant_id as string);
            if (covId) covenantIds.add(covId);
          }),
        );
      }

      // ── CONTRACTOR: query CovenantCreated events ──────────────────────────
      if (role === 'contractor' || role === 'both') {
        try {
          const events = await suiClient.queryEvents({
            query: { MoveEventType: `${ACCORD_PACKAGE_ID}::covenant::CovenantCreated` },
            limit: 100,
            order: 'descending',
          });

          for (const event of events.data) {
            const parsed = parseCreateCovenantEvent(event);
            if (parsed && parsed.contractor.toLowerCase() === address.toLowerCase()) {
              covenantIds.add(parsed.covenant_id);
            }
          }
        } catch (eventErr) {
          // queryEvents may fail on some testnet nodes — fallback silently
          console.warn('[hooks] queryEvents failed for contractor query:', (eventErr as Error).message);
        }
      }

      // ── Fetch covenant objects (deduplicated) ─────────────────────────────
      if (covenantIds.size === 0) {
        setCovenants([]);
        setLoading(false);
        return;
      }

      const allCovenants: CovenantData[] = [];
      await Promise.all(
        Array.from(covenantIds).map(async (id) => {
          try {
            const resp: SuiObjectResponse = await suiClient.getObject({
              id,
              options: { showContent: true },
            });
            if (resp.data) {
              const parsed = parseCovenantObject(resp.data);
              if (parsed) allCovenants.push(parsed);
            }
          } catch {
            // object may have been deleted — skip
          }
        }),
      );

      setCovenants(allCovenants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch covenants');
    } finally {
      setLoading(false);
    }
  }, [address, role]);

  useEffect(() => {
    fetchCovenants();
  }, [fetchCovenants]);

  return { covenants, loading, error, refetch: fetchCovenants };
}

// ─── useReputationProfile ───────────────────────────────────────────────────────

export function useReputationProfile(address: string | null) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !ACCORD_PACKAGE_ID) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    suiClient.getOwnedObjects({
      owner: address,
      filter: { StructType: `${ACCORD_PACKAGE_ID}::reputation::ReputationProfile` },
      options: { showContent: true },
    }).then(resp => {
      for (const obj of resp.data) {
        if (obj.data) {
          const parsed = parseProfileObject(obj.data);
          if (parsed) {
            parsed.handle = `${address.slice(0, 8)}.accord`;
            setProfile(parsed);
            setLoading(false);
            return;
          }
        }
      }
      setProfile(null);
      setLoading(false);
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Failed to fetch profile');
      setLoading(false);
    });
  }, [address]);

  return { profile, loading, error };
}

// ─── useProofCertificate ───────────────────────────────────────────────────────

export function useProofCertificate(certificateId: string | null) {
  const [certificate, setCertificate] = useState<ProofCertificateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!certificateId || !ACCORD_PACKAGE_ID) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    suiClient.getObject({
      id: certificateId,
      options: { showContent: true },
    }).then(resp => {
      if (resp.data) {
        const parsed = parseProofCertificateObject(resp.data);
        if (parsed) {
          setCertificate(parsed);
        } else {
          setError('Failed to parse certificate');
        }
      } else {
        setError('Certificate not found');
      }
      setLoading(false);
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Failed to fetch certificate');
      setLoading(false);
    });
  }, [certificateId]);

  return { certificate, loading, error };
}

// ─── useProofCertificatesByOwner ──────────────────────────────────────────────

export function useProofCertificatesByOwner(address: string | null) {
  const [certificates, setCertificates] = useState<ProofCertificateData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !ACCORD_PACKAGE_ID) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    suiClient.getOwnedObjects({
      owner: address,
      filter: { StructType: `${ACCORD_PACKAGE_ID}::proof::ProofCertificate` },
      options: { showContent: true },
    }).then(resp => {
      const certs: ProofCertificateData[] = [];
      for (const obj of resp.data) {
        if (obj.data) {
          const parsed = parseProofCertificateObject(obj.data);
          if (parsed) certs.push(parsed);
        }
      }
      setCertificates(certs);
      setLoading(false);
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Failed to fetch certificates');
      setLoading(false);
    });
  }, [address]);

  return { certificates, loading, error };
}