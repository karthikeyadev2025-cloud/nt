import { withTimeout } from './withTimeout';

const queryCache = new Map<string, { result: any; at: number }>();
const inFlightQueries = new Map<string, Promise<any>>();
const DEFAULT_TTL_MS = 5000;

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
}
