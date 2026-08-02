import { supabase } from './supabase';
import { withTimeout } from './withTimeout';

// ─────────────────────────────────────────────────────────────
// Session Devices — tracks each browser/device the user signs in
// from, and lets them revoke any of them.
//
// Design:
//   • On successful sign-in the client inserts a row into
//     `user_sessions` and stashes its id in localStorage under
//     `nkt_session_row_id`.
//   • Every ~60 seconds the client heart-beats that row
//     (updates `last_seen_at`) *and* reads it back to see if it
//     was revoked. If revoked → force local sign-out.
//   • Revoking another device is just: set `revoked_at = now()`
//     on that row. That device notices on its next heart-beat.
// ─────────────────────────────────────────────────────────────

const ROW_ID_KEY = 'nkt_session_row_id';
export const SESSION_HEARTBEAT_MS = 60_000;

export function getCurrentSessionRowId(): string | null {
  try { return localStorage.getItem(ROW_ID_KEY); } catch { return null; }
}

function setCurrentSessionRowId(id: string | null) {
  try {
    if (id) localStorage.setItem(ROW_ID_KEY, id);
    else localStorage.removeItem(ROW_ID_KEY);
  } catch { /* storage disabled */ }
}

// Small UA sniffer — Nikki-branded output like "Chrome on macOS".
export function describeCurrentDevice(): { label: string; platform: string; ua: string } {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  const isPWA = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;

  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';

  let os = 'Device';
  if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iOS/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  const kind = isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Desktop';
  const label = `${browser} on ${os} · ${kind}${isPWA ? ' (PWA)' : ''}`;
  const platform = isPWA ? 'web-pwa' : isMobile ? 'web-mobile' : 'web';
  return { label, platform, ua };
}

// Create a `user_sessions` row for this device. Called immediately after a
// successful Supabase sign-in.
export async function beginSession(userId: string): Promise<string | null> {
  const { label, platform, ua } = describeCurrentDevice();
  try {
    const { data, error } = await supabase
      .from('user_sessions')
      .insert({
        user_id: userId,
        device_label: label,
        user_agent: ua,
        platform_hint: platform,
      })
      .select('id')
      .single();
    if (error || !data) return null;
    setCurrentSessionRowId(data.id);
    return data.id;
  } catch {
    return null;
  }
}

// Update last_seen_at on our row and check whether the row was revoked
// remotely. Returns `true` if the caller should force a sign-out.
export async function heartbeatSession(): Promise<{ revoked: boolean }> {
  const id = getCurrentSessionRowId();
  if (!id) return { revoked: false };
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('user_sessions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', id)
        .is('revoked_at', null)
        .select('id, revoked_at')
        .maybeSingle(),
      4000,
      'heartbeat'
    );
    if (error) return { revoked: false };
    if (!data) {
      const { data: check } = await withTimeout(
        supabase
          .from('user_sessions')
          .select('revoked_at')
          .eq('id', id)
          .maybeSingle(),
        3000,
        'check revocation'
      ).catch(() => ({ data: null }));
      if (check && check.revoked_at) return { revoked: true };
    }
    return { revoked: false };
  } catch {
    return { revoked: false };
  }
}

// Called on sign-out — soft-delete our own row.
export async function endSession(): Promise<void> {
  const id = getCurrentSessionRowId();
  setCurrentSessionRowId(null);
  if (!id) return;
  try {
    await supabase
      .from('user_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
  } catch {
    // ignore — we're signing out anyway
  }
}

// Revoke a specific session row (any device belonging to the current user).
export async function revokeSessionRow(rowId: string, revokedBy: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('user_sessions')
      .update({ revoked_at: new Date().toISOString(), revoked_by: revokedBy })
      .eq('id', rowId)
      .is('revoked_at', null);
    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to revoke session' };
  }
}

// Revoke every session for this user except the current one.
export async function revokeAllOtherSessions(userId: string): Promise<{ error: string | null; count: number }> {
  const currentId = getCurrentSessionRowId();
  try {
    let query = supabase
      .from('user_sessions')
      .update({ revoked_at: new Date().toISOString(), revoked_by: userId })
      .eq('user_id', userId)
      .is('revoked_at', null);
    if (currentId) query = query.neq('id', currentId);
    const { data, error } = await query.select('id');
    if (error) return { error: error.message, count: 0 };
    // Also ask Supabase auth to invalidate other refresh tokens for good measure.
    await supabase.auth.signOut({ scope: 'others' }).catch(() => {});
    return { error: null, count: data?.length || 0 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to revoke sessions', count: 0 };
  }
}

export interface SessionRow {
  id: string;
  device_label: string;
  user_agent: string | null;
  platform_hint: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

export async function listActiveSessions(userId: string): Promise<SessionRow[]> {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('user_sessions')
        .select('id, device_label, user_agent, platform_hint, created_at, last_seen_at, revoked_at')
        .eq('user_id', userId)
        .is('revoked_at', null)
        .order('last_seen_at', { ascending: false }),
      8000,
      'list sessions'
    );
    if (error || !data) return [];
    return data as SessionRow[];
  } catch {
    return [];
  }
}
