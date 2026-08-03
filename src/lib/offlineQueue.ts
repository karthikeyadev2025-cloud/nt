import type { SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────
// Offline queue for field work.
//
// Executives log visits at customer sites where mobile data is unreliable.
// Before this, a failed save lost the notes, photo and GPS outright — the
// hardest data to recapture, because the executive has already left.
//
// Design notes:
//  - IndexedDB, not localStorage: photos are Blobs, and localStorage is a
//    ~5MB string store that would break on the first image.
//  - Every item carries a client-minted UUID (client_ref). The server has a
//    unique index on it, so replaying a request that actually succeeded before
//    the network dropped collides harmlessly instead of duplicating the visit.
//  - occurred_at is captured on the device. A week of queued visits should not
//    all appear to have happened the moment signal returned.
//  - Append-only by design: we queue the remark (a fact about what happened)
//    plus a small patch of lead fields. We never queue a whole lead row, so a
//    stale device cannot overwrite fields someone else changed meanwhile.
// ─────────────────────────────────────────────────────────────

const DB_NAME = 'nt-field-queue';
const DB_VERSION = 1;
const STORE = 'visits';

export type QueuedVisit = {
  id: string;                    // client_ref, also the IndexedDB key
  leadId: string;
  leadName: string;              // shown in the pending list without a fetch
  userId: string;
  remark: string;
  callType: string;
  occurredAt: string;            // ISO, captured on device
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  photo: Blob | null;
  leadPatch: Record<string, unknown>;
  attempts: number;
  lastError?: string;
  queuedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

export async function enqueue(item: Omit<QueuedVisit, 'attempts' | 'queuedAt'>): Promise<void> {
  await tx('readwrite', s => s.put({ ...item, attempts: 0, queuedAt: new Date().toISOString() }));
}

export async function listQueued(): Promise<QueuedVisit[]> {
  const all = await tx<QueuedVisit[]>('readonly', s => s.getAll() as IDBRequest<QueuedVisit[]>);
  return (all || []).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function removeQueued(id: string): Promise<void> {
  await tx('readwrite', s => s.delete(id));
}

async function markFailed(item: QueuedVisit, message: string): Promise<void> {
  await tx('readwrite', s => s.put({ ...item, attempts: item.attempts + 1, lastError: message }));
}

export async function queueCount(): Promise<number> {
  try {
    return await tx<number>('readonly', s => s.count());
  } catch {
    return 0;
  }
}

// Anything the server rejects on its own terms (bad data, permission) will
// never succeed on retry — dropping it after enough attempts stops a poison
// item blocking the queue forever. Network failures don't count against this
// because they never reach the server.
const MAX_ATTEMPTS = 8;

export type FlushResult = { synced: number; failed: number; remaining: number };

/**
 * Replay queued visits. Safe to call repeatedly and concurrently-ish: each
 * item is removed only after the server confirms, and client_ref makes a
 * duplicate insert a no-op.
 */
export async function flushQueue(supabase: SupabaseClient): Promise<FlushResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, failed: 0, remaining: await queueCount() };
  }

  const items = await listQueued();
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      // 1. Photo first — a remark pointing at a missing image is worse than
      //    retrying the whole item.
      let photoPath: string | null = null;
      if (item.photo) {
        const path = `${item.leadId}/${item.id}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('lead-photos')
          .upload(path, item.photo, { contentType: 'image/jpeg', upsert: true });
        if (upErr) throw new Error(`photo: ${upErr.message}`);
        photoPath = path;
      }

      // 2. The remark. Duplicate client_ref means a previous attempt already
      //    landed — treat as success and move on.
      const { error: remErr } = await supabase.from('lead_remarks').insert({
        lead_id: item.leadId,
        user_id: item.userId,
        call_type: item.callType,
        remark: item.remark,
        photo_url: photoPath,
        latitude: item.latitude,
        longitude: item.longitude,
        address: item.address,
        client_ref: item.id,
        occurred_at: item.occurredAt,
      });
      const isDuplicate = remErr && (remErr.code === '23505' || /duplicate key/i.test(remErr.message || ''));
      if (remErr && !isDuplicate) throw new Error(remErr.message);

      // 3. Lead patch. Only the fields this visit actually changed, so we
      //    don't clobber concurrent edits by a manager.
      if (Object.keys(item.leadPatch).length > 0) {
        const patch: Record<string, unknown> = { ...item.leadPatch, updated_at: new Date().toISOString() };
        if (photoPath) patch.photo_url = photoPath;
        const { error: leadErr } = await supabase
          .from('marketing_leads').update(patch).eq('id', item.leadId);
        // A lead that vanished or is no longer ours shouldn't strand the
        // remark, which is already saved. Log and continue.
        if (leadErr) console.warn('Lead patch failed on sync', leadErr.message);
      }

      await removeQueued(item.id);
      synced++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (!offline && item.attempts + 1 >= MAX_ATTEMPTS) {
        console.error('Dropping unsyncable visit after repeated failures', item.id, message);
        await removeQueued(item.id);
      } else {
        await markFailed(item, message);
      }
      failed++;
      // Stop on the first failure when offline — the rest will fail the same
      // way and we'd just burn attempts.
      if (offline) break;
    }
  }

  return { synced, failed, remaining: await queueCount() };
}

/**
 * Wire up automatic flushing: on reconnect, on tab focus, and on a slow timer
 * as a backstop for flaky connections that never fire an `online` event.
 */
export function startAutoFlush(supabase: SupabaseClient, onChange?: (r: FlushResult) => void): () => void {
  let stopped = false;

  const run = async () => {
    if (stopped) return;
    try {
      const result = await flushQueue(supabase);
      if (onChange && (result.synced > 0 || result.failed > 0)) onChange(result);
    } catch (e) {
      console.warn('Queue flush error', e);
    }
  };

  const onOnline = () => { run(); };
  const onVisible = () => { if (document.visibilityState === 'visible') run(); };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  // Only tick while visible — consistent with the same fix applied to
  // SessionDevices, the auth heartbeat, and NotificationBell. The
  // visibilitychange listener above already covers "flush once when the
  // tab regains focus"; this interval no longer needs to keep firing while
  // hidden too.
  const timer = window.setInterval(() => { if (document.visibilityState === 'visible') run(); }, 60_000);
  run();

  return () => {
    stopped = true;
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(timer);
  };
}
