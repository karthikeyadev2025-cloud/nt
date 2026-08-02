// A tiny single-flight + short-term cache for Supabase RPC calls.
//
// Real bug this fixes: ActionCentre and TodayAtAGlance both independently
// call get_dashboard_counts on mount, and Overview's segment cards call
// get_segment_summary separately from wherever else references it. Found
// via a live browser session (performance.getEntriesByType) that these
// were firing as genuine duplicates — not just once each, sometimes more,
// especially across multiple open browser tabs of the same site (Supabase
// syncs auth activity across tabs, which can cause components to remount
// and refetch around the same time in each one).
//
// Any component calling the same RPC with the same arguments within the
// cache window gets the same in-flight promise (if one's already running)
// or the same recent result (if one just finished) — one real network call
// serves every caller instead of each firing its own.
const inFlight = new Map<string, Promise<unknown>>();
const recent = new Map<string, { result: unknown; at: number }>();
const RECENT_WINDOW_MS = 5000;

export async function cachedRpc<T>(
  key: string,
  fn: () => PromiseLike<T>
): Promise<T> {
  const cachedRecent = recent.get(key);
  if (cachedRecent && Date.now() - cachedRecent.at < RECENT_WINDOW_MS) {
    return cachedRecent.result as T;
  }

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = Promise.resolve(fn());
  inFlight.set(key, promise);
  try {
    const result = await promise;
    recent.set(key, { result, at: Date.now() });
    return result;
  } finally {
    inFlight.delete(key);
  }
}
