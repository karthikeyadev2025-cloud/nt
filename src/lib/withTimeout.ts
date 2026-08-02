// Wraps any thenable (Supabase's query builder is thenable but not a real
// Promise) with a timeout, so a stalled network request can never hang the
// UI forever.
//
// Real bug this fixes: a browser with a leftover session from a DIFFERENT
// Supabase project (e.g. testing before switching to a new database) can
// have a token that's syntactically valid but doesn't correspond to
// anything real on the current backend. Some requests made with that token
// don't fail cleanly with an error — they simply never resolve. Any code
// that does `await someSupabaseCall()` with no timeout then waits forever,
// and if that await gates a `loading` state, the UI is stuck permanently
// with no way out short of the user manually clearing their browser data.
//
// Every Supabase call whose result gates a loading spinner should be
// wrapped in this.
export function withTimeout<T>(p: PromiseLike<T>, ms = 8000, label = 'request'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out — please check your connection and try again`)),
      ms
    );
    Promise.resolve(p).then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}
