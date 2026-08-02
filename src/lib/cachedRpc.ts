import { withTimeout } from './withTimeout';

const inFlight = new Map<string, Promise<unknown>>();
const recent = new Map<string, { result: unknown; at: number }>();
const RECENT_WINDOW_MS = 5000;

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
    return result;
  } catch (err) {
    throw err;
  } finally {
    inFlight.delete(key);
  }
}
