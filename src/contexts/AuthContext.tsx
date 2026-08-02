import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { logLogin, logLoginFailed, logLogout } from '../lib/securityLogger';
import { beginSession, heartbeatSession, endSession, SESSION_HEARTBEAT_MS, getCurrentSessionRowId } from '../lib/sessionTracker';
import { withTimeout } from '../lib/withTimeout';

// ═══════════════════════════════════════════════════════════════════════
// Types
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
}

interface AuthContextType {
  user: AppUser | null;
  permissions: Record<string, boolean>;
  loading: boolean;
  sessionReady: boolean;
  hasPermission: (perm: string) => boolean;
  canAccessSegment: (slug: string) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'nkt_user_session';
const AUTH_TIMEOUT_MS = 5000;

// ═══════════════════════════════════════════════════════════════════════
// Profile + permission fetchers — retry on transient failure and
// distinguish "definitely gone" from "ambiguous, try again". That
// distinction stops a momentary network blip or an RLS-propagation delay
// right after login from being treated the same as an admin disabling
// the account.
// ═══════════════════════════════════════════════════════════════════════

// Return contract:
//   • returns AppUser → active, valid profile.
//   • returns null    → row read AND is_active === false — definitively
//                        disabled. The ONLY case that should sign someone out.
//   • throws          → transient/ambiguous. Callers keep the current session.
async function fetchAppUser(userId: string): Promise<AppUser | null> {
  let retries = 4;
  let delay = 250;

  while (retries > 0) {
    let data: unknown = null;
    let error: unknown = null;
    try {
      ({ data, error } = await withTimeout(
        supabase.from('app_users').select('*').eq('id', userId).maybeSingle(),
        AUTH_TIMEOUT_MS,
        'user profile'
      ) as { data: unknown; error: unknown });
    } catch (e) {
      retries--;
      if (retries === 0) throw e;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
      continue;
    }

    if (error) {
      retries--;
      if (retries === 0) throw error;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
      continue;
    }

    if (data) {
      if ((data as AppUser).is_active === false) return null;
      return data as AppUser;
    }

    // Query succeeded but returned no row — usually RLS token-propagation
    // lag right after sign-in/refresh. Wait and retry.
    retries--;
    if (retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      delay *= 2; // 250ms, 500ms, 1000ms, 2000ms
    }
  }

  throw new Error('Profile not visible yet — keeping existing session.');
}

// A silent failure here quietly leaves permissions = {}, so every
// hasPermission() check returns false and role-specific tabs just vanish
// with no visible error. Retrying protects against a single transient
// blip stripping someone's permissions until their next full login.
async function fetchRolePermissions(role: string): Promise<Record<string, boolean>> {
  let retries = 3;
  let delay = 250;
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
  const [loading, setLoading] = useState(() => {
    try { return !localStorage.getItem(SESSION_KEY); } catch { return true; }
  });
  const [sessionReady, setSessionReady] = useState(false);

  const inFlightLoadRef = useRef<{ userId: string; promise: Promise<AppUser | null> } | null>(null);
  const recentLoadRef = useRef<{ userId: string; result: AppUser | null; at: number } | null>(null);
  const RECENT_LOAD_WINDOW_MS = 2000;

  async function loadUser(userId: string): Promise<AppUser | null> {
    const existing = inFlightLoadRef.current;
    if (existing && existing.userId === userId) return existing.promise;

    const recent = recentLoadRef.current;
    if (recent && recent.userId === userId && Date.now() - recent.at < RECENT_LOAD_WINDOW_MS) {
      return recent.result;
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
  // Initial load + auth state subscription
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const hasCachedSession = (() => {
      try { return !!localStorage.getItem(SESSION_KEY); } catch { return false; }
    })();
    // Supabase's client hydrates its session synchronously from localStorage
    // the moment it's constructed — before React even mounts. The token is
    // already available immediately; there's nothing to actually wait for
    // here. This was previously 500ms, which is pure unnecessary time added
    // to the blank-loading-screen phase on every single page refresh — the
    // one moment in the whole app where a full browser reload (not an
    // in-app transition) forces a real, visible restart from zero. Keeping
    // this a hair above 0ms (not literally synchronous) avoids any edge
    // case around React's render timing, while cutting 10x off the wait.
    const cacheTrustTimer = hasCachedSession
      ? setTimeout(() => { if (mounted) { setLoading(false); setSessionReady(true); } }, 50)
      : undefined;
    const safetyTimer = setTimeout(() => {
      if (mounted) { setLoading(false); setSessionReady(true); }
    }, AUTH_TIMEOUT_MS);

    (async () => {
      let session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] = null;
      let getSessionFailed = false;
      try {
        ({ data: { session } } = await withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS, 'session'));
      } catch {
        getSessionFailed = true;
      }

      if (!mounted) { clearTimeout(safetyTimer); if (cacheTrustTimer) clearTimeout(cacheTrustTimer); return; }

      try {
        if (getSessionFailed) {
          // Leave the cached user and stored tokens untouched.
        } else if (session?.user) {
          try {
            const loaded = await loadUser(session.user.id);
            if (loaded === null && mounted) {
              clearLocalSession();
              await supabase.auth.signOut().catch(() => {});
            }
          } catch {
            // Transient/ambiguous profile read — keep the cached user.
          }
        } else {
          clearLocalSession();
        }
      } finally {
        if (mounted) {
          clearTimeout(safetyTimer);
          if (cacheTrustTimer) clearTimeout(cacheTrustTimer);
          setLoading(false);
          setSessionReady(true);
        }
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        clearLocalSession();
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
        try {
          await new Promise(r => setTimeout(r, 100));
          const loaded = await loadUser(session.user.id);
          if (loaded === null && mounted && event === 'SIGNED_IN') {
            clearLocalSession();
            await supabase.auth.signOut().catch(() => {});
          }
        } catch {
          // Transient failure — leave the existing session alone.
        }
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      if (cacheTrustTimer) clearTimeout(cacheTrustTimer);
      subscription.unsubscribe();
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // Device heartbeat
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !sessionReady) return;
    let stopped = false;
    let handle: number | undefined;
    let consecutiveRevoked = 0;

    async function tick() {
      if (stopped) return;
      if (!getCurrentSessionRowId()) {
        await beginSession(user!.id);
        consecutiveRevoked = 0;
      } else {
        const { revoked } = await heartbeatSession();
        if (revoked) {
          consecutiveRevoked++;
          if (consecutiveRevoked >= 2 && !stopped) {
            await signOut();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, sessionReady]);

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

  async function signOut() {
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
  }

  async function refreshUser() {
    try {
      const { data: { session } } = await withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS, 'session');
      if (session?.user) {
        await loadUser(session.user.id);
      } else {
        clearLocalSession();
      }
    } catch {
      // Keep whatever we already have.
    }
  }

  return (
    <AuthContext.Provider value={{ user, permissions, loading, sessionReady, hasPermission, canAccessSegment, signIn, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
