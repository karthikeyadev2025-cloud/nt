import { withTimeout } from './withTimeout';

const queryCache = new Map<string, { result: unknown; at: number }>();
const inFlightQueries = new Map<string, Promise<unknown>>();
const DEFAULT_TTL_MS = 300_000; // 5 minutes

// Initialize memory cache from sessionStorage for instant 0ms startup
try {
  const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('nkt_query_cache') : null;
  if (stored) {
    const parsed = JSON.parse(stored);
    Object.entries(parsed as Record<string, { result: unknown; at: number }>).forEach(([k, v]) => {
      if (v && typeof v.at === 'number' && Date.now() - v.at < 600_000) {
        queryCache.set(k, v);
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
    queryCache.forEach((val, k) => {
      if (count < 40) {
        obj[k] = val;
        count++;
      }
    });
    sessionStorage.setItem(QUERY_CACHE_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* ignore storage quota */
  }
}

export async function cachedQuery<T>(
  key: string,
  fn: () => PromiseLike<T>,
  ttlMs = DEFAULT_TTL_MS,
  timeoutMs = 6000
): Promise<T> {
  const cached = queryCache.get(key);
  if (cached && Date.now() - cached.at < ttlMs) {
    return cached.result as T;
  }

  const existing = inFlightQueries.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = withTimeout(Promise.resolve(fn()), timeoutMs, key);
  inFlightQueries.set(key, promise);

  try {
    const result = await promise;
    queryCache.set(key, { result, at: Date.now() });
    syncToSessionStorage();
    return result;
  } catch (err) {
    if (cached) return cached.result as T;
    throw err;
  } finally {
    inFlightQueries.delete(key);
  }
}

export const QUERY_CACHE_STORAGE_KEY = 'nkt_query_cache';

/**
 * Wipes the query cache completely — memory AND the sessionStorage backup.
 *
 * invalidateQueryCache() alone is NOT enough at sign-out: sessionStorage
 * survives the same-tab navigation signOut performs, so the next person to
 * sign in on a shared machine would hydrate the previous user's cached rows
 * (staff list with salary_structure, payslips, HR records) before their own
 * RLS-scoped fetches came back.
 */
export function clearQueryCache() {
  queryCache.clear();
  inFlightQueries.clear();
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
  } catch { /* storage restricted */ }
}

export function invalidateQueryCache(keyPrefix?: string) {
  if (!keyPrefix) {
    queryCache.clear();
  } else {
    for (const k of queryCache.keys()) {
      if (k.startsWith(keyPrefix)) queryCache.delete(k);
    }
  }
  syncToSessionStorage();
}
