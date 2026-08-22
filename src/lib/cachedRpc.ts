import { withTimeout } from './withTimeout';

const inFlight = new Map<string, Promise<unknown>>();
const recent = new Map<string, { result: unknown; at: number }>();
// Default cache window for RPC results. Individual call sites can override
// via the ttlMs argument on cachedRpc(). 5 minutes was the original value
// which turned out to be way too long for the dashboard counters —
// closing a ticket left the "open tickets" number wrong for up to 5 min.
// The dashboard call now passes 30_000 explicitly.
const DEFAULT_RECENT_WINDOW_MS = 300_000; // 5 minutes

// Initialize memory cache from sessionStorage for instant 0ms startup
try {
  const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('nkt_rpc_cache') : null;
  if (stored) {
    const parsed = JSON.parse(stored);
    Object.entries(parsed as Record<string, { result: unknown; at: number }>).forEach(([k, v]) => {
      if (v && typeof v.at === 'number' && Date.now() - v.at < 600_000) {
        recent.set(k, v);
      }
    });
  }
} catch {
  /* storage restricted */
}

function syncToSessionStorage() {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const obj: Record<string, { result: unknown; at: number }> = {};
    let count = 0;
    recent.forEach((val, k) => {
      if (count < 20) {
        obj[k] = val;
        count++;
      }
    });
    sessionStorage.setItem(RPC_CACHE_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* ignore storage quota */
  }
}

export async function cachedRpc<T>(
  key: string,
  fn: () => PromiseLike<T>,
  timeoutMs = 15_000,
  ttlMs = DEFAULT_RECENT_WINDOW_MS
): Promise<T> {
  const cachedRecent = recent.get(key);
  if (cachedRecent && Date.now() - cachedRecent.at < ttlMs) {
    return cachedRecent.result as T;
  }

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = withTimeout(Promise.resolve(fn()), timeoutMs);
  inFlight.set(key, promise);
  try {
    const result = await promise;
    recent.set(key, { result, at: Date.now() });
    syncToSessionStorage();
    return result;
  } catch (err) {
    if (cachedRecent) return cachedRecent.result as T;
    throw err;
  } finally {
    inFlight.delete(key);
  }
}

export const RPC_CACHE_STORAGE_KEY = 'nkt_rpc_cache';

/** Full wipe of the RPC cache — memory and the sessionStorage backup. See
 *  clearQueryCache() in cachedQuery.ts for why sign-out needs both. */
export function clearRpcCache() {
  recent.clear();
  inFlight.clear();
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(RPC_CACHE_STORAGE_KEY);
  } catch { /* storage restricted */ }
}

// Removes every cached entry whose key starts with the given prefix, from
// both the in-memory cache and its sessionStorage backup. Call this right
// after any action that changes data the cache might be holding stale —
// e.g. after a bulk lead upload, so the next dashboard view reflects the
// new leads immediately instead of serving up to 5 minutes of stale counts.
export function invalidateRpcCache(keyPrefix: string) {
  const keysToRemove: string[] = [];
  recent.forEach((_, k) => { if (k.startsWith(keyPrefix)) keysToRemove.push(k); });
  keysToRemove.forEach(k => recent.delete(k));
  if (keysToRemove.length > 0) syncToSessionStorage();
}

// NOTE: this module used to also export `invalidateQueryCache` — the exact
// same name cachedQuery.ts exports, for a DIFFERENT cache. Importing the
// wrong one silently no-opped, which is how several write paths ended up
// "invalidating" nothing at all. Every call site now goes through
// lib/cacheBus's invalidate(), which clears both caches; don't reintroduce
// a same-named export here.
