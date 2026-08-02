import { withTimeout } from './withTimeout';

const inFlight = new Map<string, Promise<unknown>>();
const recent = new Map<string, { result: unknown; at: number }>();
const RECENT_WINDOW_MS = 300_000; // 5 minutes

// Initialize memory cache from sessionStorage for instant 0ms startup
try {
  const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('nkt_rpc_cache') : null;
  if (stored) {
    const parsed = JSON.parse(stored);
    Object.entries(parsed).forEach(([k, v]: [string, any]) => {
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
    const obj: Record<string, any> = {};
    let count = 0;
    recent.forEach((val, k) => {
      if (count < 20) {
        obj[k] = val;
        count++;
      }
    });
    sessionStorage.setItem('nkt_rpc_cache', JSON.stringify(obj));
  } catch {
    /* ignore storage quota */
  }
}

export async function cachedRpc<T>(
  key: string,
  fn: () => PromiseLike<T>,
  timeoutMs = 3000
): Promise<T> {
  const cachedRecent = recent.get(key);
  if (cachedRecent && Date.now() - cachedRecent.at < RECENT_WINDOW_MS) {
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
