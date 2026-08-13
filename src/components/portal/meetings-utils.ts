import { supabase } from '../../lib/supabase';

// Split out of meetings.tsx specifically because that file also exports
// React components, and mixing the two defeats Vite's fast-refresh (an
// edit to a plain function here would force a full reload of every
// component in meetings.tsx too, not just the one that changed).

type RpcResult = { ok: boolean; meeting_id?: string; conflict?: string; message?: string };

export async function rpcCall<T = RpcResult>(fn: string, args: Record<string, unknown>): Promise<{ data: T | null; error: { message: string } | null }> {
  // Call supabase.rpc(...) directly — extracting it to a local variable
  // first detaches it from the client instance's `this` and throws
  // "Cannot read properties of undefined (reading 'rest')" inside the
  // library (this.rest.rpc(...) with this === undefined). Every call
  // through this helper was silently failing because of that, swallowed
  // by the async-function wrapper turning the synchronous throw into a
  // rejected promise that callers' .catch() then quietly ate.
  return supabase.rpc(fn as never, args as never) as unknown as Promise<{ data: T | null; error: { message: string } | null }>;
}
