/**
 * Backup engine.
 *
 * Every mutation does two things, in this order:
 *   1. write the chart document to IndexedDB (durable on this device)
 *   2. enqueue a remote backup in the outbox
 *
 * The outbox drains to Supabase when `VITE_SUPABASE_URL` and
 * `VITE_SUPABASE_ANON_KEY` are present. When they are not, work stays queued
 * and the UI says "On this device" — it never claims a cloud copy exists.
 */

import type { AppState, BackupStatus, OutboxItem, OutboxKind, SyncPhase } from '../types';
import { getBlob, readDoc, readOutbox, writeDoc, writeOutbox } from './idb';
import { isConfigured, pushBodyMetrics, pushChart, pushMedia } from './supabase';
import { uid } from './format';

export const STATE_DOC = 'chart-state';
const META_DOC = 'backup-meta';
const WRITE_DEBOUNCE_MS = 180;
const MAX_ATTEMPTS = 5;

interface BackupMeta {
  lastLocalWriteAt: string | null;
  lastSyncedAt: string | null;
}

type Listener = (status: BackupStatus) => void;

function summarizeQueue(items: OutboxItem[]): number {
  return items.length;
}

class BackupEngine {
  private outbox: OutboxItem[] = [];
  private meta: BackupMeta = { lastLocalWriteAt: null, lastSyncedAt: null };
  private listeners = new Set<Listener>();
  private phase: SyncPhase = isConfigured() ? 'idle' : 'unconfigured';
  private lastError: string | null = null;
  private pendingState: AppState | null = null;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.outbox = await readOutbox<OutboxItem>();
    this.meta = (await readDoc<BackupMeta>(META_DOC)) ?? this.meta;
    this.emit();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.flush());
      const commit = () => void this.commitNow();
      window.addEventListener('pagehide', commit);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') commit();
      });
    }
    void this.flush();
  }

  status(): BackupStatus {
    return {
      configured: isConfigured(),
      phase: this.phase,
      pending: summarizeQueue(this.outbox),
      lastLocalWriteAt: this.meta.lastLocalWriteAt,
      lastSyncedAt: this.meta.lastSyncedAt,
      lastError: this.lastError,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const status = this.status();
    for (const listener of this.listeners) listener(status);
  }

  /** Called after every state mutation. Local write first, then enqueue. */
  recordChange(state: AppState, summary: string, clientId: string | null): void {
    this.pendingState = state;
    this.enqueue('chart', summary, clientId, null);
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => void this.commitNow(), WRITE_DEBOUNCE_MS);
  }

  /** A recorded clip or voice note: the blob is already in IndexedDB. */
  recordMedia(kind: Exclude<OutboxKind, 'chart'>, blobKey: string, summary: string, clientId: string): void {
    this.enqueue(kind, summary, clientId, blobKey);
    void this.persistOutbox();
    void this.flush();
  }

  private enqueue(
    kind: OutboxKind,
    summary: string,
    clientId: string | null,
    blobKey: string | null,
  ): void {
    if (kind === 'chart') {
      // One pending chart push per client: the newest snapshot supersedes the
      // older ones, so a long session does not build a queue of stale copies.
      const existing = this.outbox.find((i) => i.kind === 'chart' && i.clientId === clientId);
      if (existing) {
        existing.at = new Date().toISOString();
        existing.summary = summary;
        existing.attempts = 0;
        existing.lastError = null;
        this.emit();
        return;
      }
    }
    this.outbox.push({
      id: uid('out'),
      at: new Date().toISOString(),
      kind,
      summary,
      clientId,
      blobKey,
      attempts: 0,
      lastError: null,
    });
    this.emit();
  }

  /** Flush the debounced local write immediately. */
  async commitNow(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    if (this.pendingState) {
      await writeDoc(STATE_DOC, this.pendingState);
      this.meta = { ...this.meta, lastLocalWriteAt: new Date().toISOString() };
      await writeDoc(META_DOC, this.meta);
    }
    await this.persistOutbox();
    this.emit();
    void this.flush();
  }

  private async persistOutbox(): Promise<void> {
    await writeOutbox(this.outbox);
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    if (!isConfigured()) {
      this.phase = 'unconfigured';
      this.emit();
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (!this.outbox.length) {
      this.phase = 'idle';
      this.emit();
      return;
    }

    this.flushing = true;
    this.phase = 'syncing';
    this.lastError = null;
    this.emit();

    const state = this.pendingState ?? (await readDoc<AppState>(STATE_DOC));
    const remaining: OutboxItem[] = [];

    for (const item of this.outbox) {
      try {
        await this.push(item, state);
        this.meta = { ...this.meta, lastSyncedAt: new Date().toISOString() };
      } catch (error) {
        item.attempts += 1;
        item.lastError = error instanceof Error ? error.message : String(error);
        this.lastError = item.lastError;
        if (item.attempts < MAX_ATTEMPTS) remaining.push(item);
      }
    }

    this.outbox = remaining;
    this.phase = this.lastError ? 'error' : 'idle';
    await writeDoc(META_DOC, this.meta);
    await this.persistOutbox();
    this.flushing = false;
    this.emit();
  }

  private async push(item: OutboxItem, state: AppState | null): Promise<void> {
    if (item.kind === 'chart') {
      const client = state?.clients.find((c) => c.id === item.clientId);
      if (!client) return;
      await pushChart(client, state?.clinicName ?? 'Clinic');
      await pushBodyMetrics(client.bodyMetrics);
      return;
    }
    if (!item.blobKey) return;
    const blob = await getBlob(item.blobKey);
    if (!blob) return;
    const folder = item.kind === 'clip' ? 'clips' : 'voice';
    await pushMedia(`${item.clientId}/${folder}/${item.blobKey}`, blob);
  }

  /** Used by "Retry now" in Settings. */
  async retry(): Promise<void> {
    for (const item of this.outbox) {
      item.attempts = 0;
      item.lastError = null;
    }
    this.lastError = null;
    await this.flush();
  }

  queue(): OutboxItem[] {
    return [...this.outbox].sort((a, b) => (a.at < b.at ? 1 : -1));
  }
}

export const backup = new BackupEngine();

/** Human label for the three states Jason asked to see. */
export function backupLabel(status: BackupStatus): string {
  if (!status.configured) {
    return status.pending > 0 ? 'On this device' : 'On this device';
  }
  if (status.phase === 'syncing') return 'Backing up…';
  if (status.phase === 'error') return 'Cloud backup failed';
  if (status.pending > 0) return 'Queued for cloud';
  return 'Synced';
}

export function backupTone(status: BackupStatus): 'accent' | 'warn' | 'danger' | 'plain' {
  if (!status.configured) return 'plain';
  if (status.phase === 'error') return 'danger';
  if (status.pending > 0 || status.phase === 'syncing') return 'warn';
  return 'accent';
}
