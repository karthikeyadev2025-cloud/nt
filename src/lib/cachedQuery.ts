import { withTimeout } from './withTimeout';

const queryCache = new Map<string, { result: any; at: number }>();
const inFlightQueries = new Map<string, Promise<any>>();
const DEFAULT_TTL_MS = 300_000; // 5 minutes

// Initialize memory cache from sessionStorage for instant 0ms startup
try {
  const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('nkt_query_cache') : null;
  if (stored) {
    const parsed = JSON.parse(stored);
    Object.entries(parsed).forEach(([k, v]: [string, any]) => {
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
    const obj: Record<string, any> = {};
    let count = 0;
    queryCache.forEach((val, k) => {
      if (count < 40) {
        obj[k] = val;
        count++;
      }
    });
    sessionStorage.setItem('nkt_query_cache', JSON.stringify(obj));
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
