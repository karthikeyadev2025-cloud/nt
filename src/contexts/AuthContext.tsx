import { createContext, useContext, useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { logLogin, logLoginFailed, logLogout } from '../lib/securityLogger';
import { beginSession, heartbeatSession, endSession, SESSION_HEARTBEAT_MS, getCurrentSessionRowId } from '../lib/sessionTracker';
import { withTimeout } from '../lib/withTimeout';

// ═══════════════════════════════════════════════════════════════════════
// SIMPLIFIED DESIGN — rewritten after a full day of finding that layered,
// overlapping timers (a separate "cache trust" timer, a separate "safety"
// timer, a separate "sessionReady" flag gating the whole UI) were
// themselves an unpredictable source of bugs — confirmed via multiple real
// browser traces showing these timers firing 3-4x later than their nominal
// duration when throttled, sometimes turning a clean load into a 20+
// second freeze. This version has exactly ONE timing mechanism controlling
// the whole initial-load sequence: one bounded async check, done once.
// The tradeoff: a returning user with a cached session no longer gets an
// "instant, zero-wait" render — they wait for one real, bounded check
// (capped at 4s) same as everyone else. That's a deliberate choice: a
// consistent, predictable "never more than ~4 seconds" beats an
// inconsistent "usually instant, occasionally 20+ seconds for reasons that
// were hard to fully pin down."
// ═══════════════════════════════════════════════════════════════════════

export type UserRole =
  | 'super_admin' | 'manager' | 'hr' | 'marketing_executive'
  | 'telecaller' | 'support_agent' | 'employee';

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  segments: string[];
  permission_overrides: Record<string, boolean>;
  phone: string;
  designation: string;
  is_active: boolean;
  must_change_password?: boolean;
  profile_photo_url?: string | null;
  salary_structure?: { basic?: number; hra?: number; allowances?: number; deductions?: number; ctc?: number };
  joining_date?: string | null;
  employment_type?: string;
  reporting_time?: string;
  // Fields the IDCard/Directory features read. Kept optional because they
  // may be null in the DB and are surfaced to the UI as "—" fallbacks.
  staff_code?: string | null;
  blood_group?: string | null;
  bank_details?: { account_holder?: string; account_number?: string; ifsc?: string; bank_name?: string } | null;
  address?: string | null;
}

interface AuthContextType {
  user: AppUser | null;
  permissions: Record<string, boolean>;
  loading: boolean;
  hasPermission: (perm: string) => boolean;
  canAccessSegment: (slug: string) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'nkt_user_session';
// One bounded check, one timeout, used everywhere. Short enough that a
// stalled connection never leaves the user staring at a loader for long;
// long enough that a normal, slightly-slow round trip still succeeds
// instead of falling back unnecessarily.
const AUTH_TIMEOUT_MS = 2500;

// ═══════════════════════════════════════════════════════════════════════
// Profile + permission fetchers — retry on transient failure, distinguish
// "definitely gone" from "ambiguous, try again".
// ═══════════════════════════════════════════════════════════════════════

async function fetchAppUser(userId: string): Promise<AppUser | null> {
  // Two failure modes with opposite correct responses:
  //   • Transient (timeout, network error, error from Supabase)  → throw,
  //     caller keeps the cached session (never sign someone out on ambiguity).
  //   • Definitive "no such row" (data === null AND error === null)
  //     → return null, caller signs the user out. This is how a
  //     hard-deleted or fully-removed user actually stops being logged in.
  // Previously both paths threw, so deleted users stayed logged in forever.
  let retries = 2;
  let delay = 150;
  let sawCleanNotFound = false;

  while (retries > 0) {
    let data: unknown = null;
    let error: unknown = null;
    try {
      ({ data, error } = await withTimeout(
        supabase.from('app_users').select('*').eq('id', userId).maybeSingle(),
        AUTH_TIMEOUT_MS,
        'user profile'
      ) as { data: unknown; error: unknown });
    } catch {
      retries--;
      if (retries === 0) break;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
      continue;
    }

    if (error) {
      retries--;
      if (retries === 0) break;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
      continue;
    }

    if (data) {
      if ((data as AppUser).is_active === false) return null;
      return data as AppUser;
    }

    // data === null AND error === null → row genuinely does not exist.
    // Retry once anyway (replica lag right after a fresh insert), but if
    // we consistently see the same clean not-found, treat as deleted.
    sawCleanNotFound = true;
    retries--;
    if (retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }

  if (sawCleanNotFound) return null;
  throw new Error('Profile not visible yet — keeping existing session.');
}

async function fetchRolePermissions(role: string): Promise<Record<string, boolean>> {
  let retries = 2;
  let delay = 150;
  while (retries > 0) {
    try {
      const { data, error } = await withTimeout(
        supabase.from('role_permissions').select('permissions').eq('role_name', role).maybeSingle(),
        AUTH_TIMEOUT_MS,
        'permissions'
      );
      if (error) throw error;
      return data ? ((data.permissions as Record<string, boolean>) ?? {}) : {};
    } catch {
      retries--;
      if (retries > 0) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }
  return {};
}

// ═══════════════════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════════════════

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => {
    try {
      const cached = localStorage.getItem(SESSION_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [permissions, setPermissions] = useState<Record<string, boolean>>(() => {
    try {
      const cached = localStorage.getItem(SESSION_KEY + '_perms');
      return cached ? JSON.parse(cached) : {};
    } catch { return {}; }
  });
  // Fast-path: if a valid session exists in localStorage, hydrate user/perms
  // instantly (loading = false) so returning users see their portal in 0ms on
  // refresh without waiting for background network verification.
  const [loading, setLoading] = useState(() => {
    try {
      return !localStorage.getItem(SESSION_KEY);
    } catch {
      return true;
    }
  });

  const inFlightLoadRef = useRef<{ userId: string; promise: Promise<AppUser | null> } | null>(null);
  const recentLoadRef = useRef<{ userId: string; result: AppUser | null; at: number } | null>(null);
  const RECENT_LOAD_WINDOW_MS = 15000;

  async function loadUser(userId: string, opts?: { force?: boolean }): Promise<AppUser | null> {
    const existing = inFlightLoadRef.current;
    if (existing && existing.userId === userId) return existing.promise;

    // Recent-load cache: skip when force=true so refreshUser() actually
    // fetches fresh data. Automatic re-loads (auth state changes, initial
    // load) still benefit from the 15s dedup window.
    if (!opts?.force) {
      const recent = recentLoadRef.current;
      if (recent && recent.userId === userId && Date.now() - recent.at < RECENT_LOAD_WINDOW_MS) {
        return recent.result;
      }
    }

    const promise = (async () => {
      const appUser = await fetchAppUser(userId);
      if (!appUser) return null;
      const rolePerms = appUser.role === 'super_admin'
        ? { all: true }
        : await fetchRolePermissions(appUser.role);
      const perms = { ...rolePerms, ...(appUser.permission_overrides || {}) };
      setUser(appUser);
      setPermissions(perms);
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(appUser));
        localStorage.setItem(SESSION_KEY + '_perms', JSON.stringify(perms));
      } catch { /* storage disabled */ }
      return appUser;
    })();

    inFlightLoadRef.current = { userId, promise };
    try {
      const result = await promise;
      if (result) recentLoadRef.current = { userId, result, at: Date.now() };
      return result;
    } finally {
      if (inFlightLoadRef.current?.promise === promise) inFlightLoadRef.current = null;
    }
  }

  function clearLocalSession() {
    setUser(null);
    setPermissions({});
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY + '_perms');
    } catch { /* storage disabled */ }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Initial load — ONE async check, ONE timeout, done.
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(), AUTH_TIMEOUT_MS, 'session'
        );
        if (!mounted) return;

        if (session?.user) {
          try {
            const loaded = await loadUser(session.user.id);
            if (loaded === null && mounted) {
              clearLocalSession();
              await supabase.auth.signOut().catch(() => {});
            }
          } catch {
            // Transient profile-read failure — keep whatever cached user we
            // already have rather than sign anyone out on ambiguity.
          }
        } else {
          clearLocalSession();
        }
      } catch {
        // getSession() itself timed out or failed — keep the cached user
        // and stored tokens untouched. A later auth event or manual
        // refresh reconciles this; we do not treat "couldn't check in
        // time" as "signed out".
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        clearLocalSession();
        return;
      }
      // TOKEN_REFRESHED deliberately does not trigger a re-fetch — it only
      // means the JWT was renewed, not that the profile changed. Confirmed
      // via a real HAR file that this fires repeatedly during ordinary use
      // (e.g. whenever the tab regains focus) and was producing real,
      // wasted, repeated profile queries for no benefit.
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
        try {
          const loaded = await loadUser(session.user.id);
          if (loaded === null && mounted && event === 'SIGNED_IN') {
            clearLocalSession();
            await supabase.auth.signOut().catch(() => {});
          }
        } catch {
          // Transient — leave the existing session alone.
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // Device heartbeat — gated on `user` and `!loading`, i.e. once the one
  // initial check above has actually completed. No separate flag.
  //
  // signOut is called via a ref so the heartbeat effect does not need
  // to restart every time signOut's closure changes. Restarting the
  // heartbeat every ~keystroke that touches auth state would reset the
  // consecutiveRevoked counter mid-check and defeat the "require 2
  // consecutive revocations before signing out" guard.
  // ─────────────────────────────────────────────────────────────────────
  const signOutRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    if (!user || loading) return;
    let stopped = false;
    let handle: number | undefined;
    let consecutiveRevoked = 0;

    async function tick() {
      if (stopped) return;
      if (document.visibilityState !== 'visible') {
        handle = window.setTimeout(tick, SESSION_HEARTBEAT_MS);
        return;
      }
      if (!getCurrentSessionRowId()) {
        await beginSession(user!.id);
        consecutiveRevoked = 0;
      } else {
        const { revoked } = await heartbeatSession();
        if (revoked) {
          consecutiveRevoked++;
          if (consecutiveRevoked >= 2 && !stopped) {
            // Ref access — always the latest signOut, never a stale closure.
            await signOutRef.current?.();
            return;
          }
        } else {
          consecutiveRevoked = 0;
        }
      }
      handle = window.setTimeout(tick, SESSION_HEARTBEAT_MS);
    }

    handle = window.setTimeout(tick, 3000);
    return () => {
      stopped = true;
      if (handle !== undefined) window.clearTimeout(handle);
    };
  }, [user?.id, user, loading]);

  // ─────────────────────────────────────────────────────────────────────
  // Permission refresh — closes a real gap: an admin can change a staff
  // member's segments or permission_overrides in Super Admin, but that
  // staff member's already-open session keeps using whatever was cached
  // at login (localStorage + React state) until they manually sign out
  // and back in. For a telecaller mid-shift, that could be hours.
  //
  // Fix: silently re-fetch role permissions + overrides every 3 minutes,
  // and immediately on regaining tab visibility (the moment someone
  // switches back to this tab after being away — the natural point where
  // "did anything change while I was gone" matters). force:true bypasses
  // the 15s recentLoad dedup so this always hits the DB, not a stale cache.
  useEffect(() => {
    if (!user || loading) return;
    let stopped = false;

    async function refreshPermissionsSilently() {
      if (stopped || document.visibilityState !== 'visible') return;
      await loadUser(user!.id, { force: true }).catch(() => {
        // Non-fatal — next interval tick or visibility change retries.
      });
    }

    const intervalHandle = window.setInterval(refreshPermissionsSilently, 3 * 60 * 1000);
    const onVisibility = () => { if (document.visibilityState === 'visible') refreshPermissionsSilently(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      window.clearInterval(intervalHandle);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.id, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────
  // Public actions
  // ─────────────────────────────────────────────────────────────────────

  const hasPermission = (perm: string) =>
    !!user && (user.role === 'super_admin' || permissions[perm] === true || permissions['all'] === true);

  const canAccessSegment = (slug: string) =>
    !!user && (user.role === 'super_admin' || user.segments?.includes('all') || user.segments?.includes(slug));

  async function signIn(email: string, password: string) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) return { error: 'Enter your email and password.' };
    if (!isSupabaseConfigured) return { error: 'Sign-in is not configured. Please contact your administrator.' };

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: cleanEmail, password }),
        AUTH_TIMEOUT_MS,
        'sign-in'
      );

      if (error) {
        logLoginFailed(cleanEmail);
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('invalid') && msg.includes('credentials')) return { error: 'Incorrect email or password.' };
        if (msg.includes('email not confirmed')) return { error: 'Please confirm your email before signing in.' };
        if (msg.includes('rate limit') || msg.includes('too many')) return { error: 'Too many attempts. Please wait a minute and try again.' };
        return { error: error.message || 'Sign-in failed. Please try again.' };
      }
      if (!data?.user) return { error: 'Sign-in failed. Please try again.' };

      logLogin(data.user.email || cleanEmail);

      let appUser: AppUser | null = null;
      try {
        appUser = await loadUser(data.user.id);
      } catch {
        return { error: 'Network error while loading profile. Please try again.' };
      }

      if (!appUser) {
        await supabase.auth.signOut().catch(() => {});
        clearLocalSession();
        return { error: 'Your account is not active. Please contact your administrator.' };
      }

      await beginSession(data.user.id);
      return { error: null };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : 'Sign-in failed. Please try again.' };
    }
  }

  const signOut = useCallback(async () => {
    const wasEmail = user?.email;
    clearLocalSession();
    try {
      const purgeAuthStorage = (storage: Storage) => {
        const keys: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k && (k.startsWith('sb-') || k === 'nkt_session_row_id')) keys.push(k);
        }
        keys.forEach(k => { try { storage.removeItem(k); } catch { /* ignore */ } });
      };
      purgeAuthStorage(localStorage);
      purgeAuthStorage(sessionStorage);
    } catch { /* storage disabled */ }

    try {
      if (wasEmail) logLogout(wasEmail);
      await withTimeout(endSession(), AUTH_TIMEOUT_MS, 'end session').catch(() => {});
      await withTimeout(supabase.auth.signOut(), AUTH_TIMEOUT_MS, 'sign-out').catch(() => {});
    } finally {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path === '/admin' || path === '/portal' || hash === '#admin' || hash === '#portal' || path === '/login') {
        window.location.hash = '';
        window.location.pathname = '/';
      }
    }
  }, [user?.email]);
  // Keep the ref in sync with the latest signOut so the heartbeat effect
  // never calls a stale closure without needing to restart on every
  // signOut identity change.
  signOutRef.current = signOut;

  async function refreshUser() {
    try {
      const { data: { session } } = await withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS, 'session');
      if (session?.user) {
        // Force = true. Callers of refreshUser explicitly want fresh data —
        // typically after an admin changed permissions or role. Serving a
        // 15s-old cached copy defeats the point of the button they clicked.
        await loadUser(session.user.id, { force: true });
      } else {
        clearLocalSession();
      }
    } catch {
      // Keep whatever we already have.
    }
  }

  return (
    <AuthContext.Provider value={{ user, permissions, loading, hasPermission, canAccessSegment, signIn, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
