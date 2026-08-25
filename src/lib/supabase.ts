/**
 * Supabase transport for the remote backup.
 *
 * Deliberately hand-rolled against the REST and Storage HTTP APIs rather than
 * pulling in `@supabase/supabase-js`: the app needs exactly two verbs (upsert
 * a row, put an object), it has no auth flow to manage, and every request that
 * leaves the device should be readable in one file during a security review.
 *
 * Nothing here invents success. If the env vars are absent the module reports
 * itself unconfigured and the caller leaves the work queued on the device.
 */

import type { BodyMetric, ClientRecord } from '../types';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export const MEDIA_BUCKET = 'movement-media';

export function supabaseConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/+$/, ''), anonKey };
}

export function isConfigured(): boolean {
  return supabaseConfig() !== null;
}

function headers(config: SupabaseConfig, extra: Record<string, string> = {}): HeadersInit {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
    ...extra,
  };
}

async function failure(response: Response): Promise<never> {
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 300);
  } catch {
    /* body already consumed or empty */
  }
  throw new Error(`Supabase ${response.status}: ${detail || response.statusText}`);
}

/**
 * The whole chart as one jsonb row, so a restore is a single read and the
 * shape can evolve without a migration. Normalised tables sit alongside it
 * for the queries a trainer actually wants to run in SQL.
 */
export async function pushChart(client: ClientRecord, clinicName: string): Promise<void> {
  const config = supabaseConfig();
  if (!config) throw new Error('Supabase is not configured');

  const row = {
    client_id: client.id,
    clinic_name: clinicName,
    client_name: client.name,
    condition: client.condition,
    therapist_id: client.therapistId,
    shared_therapist_ids: client.sharedTherapistIds,
    shared_with_clinic: client.sharedWithClinic,
    chart: client,
    updated_at: new Date().toISOString(),
  };

  const response = await fetch(`${config.url}/rest/v1/charts?on_conflict=client_id`, {
    method: 'POST',
    headers: headers(config, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify([row]),
  });
  if (!response.ok) await failure(response);
}

/** Flattened body metrics, so trends are queryable without unpacking jsonb. */
export async function pushBodyMetrics(metrics: BodyMetric[]): Promise<void> {
  const config = supabaseConfig();
  if (!config) throw new Error('Supabase is not configured');
  if (!metrics.length) return;

  const rows = metrics.map((m) => ({
    id: m.id,
    client_id: m.clientId,
    measured_at: m.at,
    bodyweight: m.bodyweight,
    body_fat_pct: m.bodyFatPct,
    waist: m.waist,
    hip: m.hip,
    thigh: m.thigh,
    arm: m.arm,
    resting_hr: m.restingHr,
    vo2max: m.vo2max,
    calipers: m.calipers,
    dexa: m.dexa,
    note: m.note,
    units: m.units,
    length_units: m.lengthUnits,
    logged_by: m.loggedBy,
    logged_by_id: m.loggedById,
    logged_by_name: m.loggedByName,
  }));

  const response = await fetch(`${config.url}/rest/v1/body_metrics?on_conflict=id`, {
    method: 'POST',
    headers: headers(config, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify(rows),
  });
  if (!response.ok) await failure(response);
}

/** Video and audio go to Storage; the row keeps only the object path. */
export async function pushMedia(path: string, blob: Blob): Promise<void> {
  const config = supabaseConfig();
  if (!config) throw new Error('Supabase is not configured');

  const response = await fetch(
    `${config.url}/storage/v1/object/${MEDIA_BUCKET}/${encodeURI(path)}`,
    {
      method: 'POST',
      headers: headers(config, {
        'Content-Type': blob.type || 'application/octet-stream',
        'x-upsert': 'true',
      }),
      body: blob,
    },
  );
  if (!response.ok) await failure(response);
}
