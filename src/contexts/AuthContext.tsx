import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { logLogin, logLoginFailed, logLogout } from '../lib/securityLogger';
import { beginSession, heartbeatSession, endSession, SESSION_HEARTBEAT_MS, getCurrentSessionRowId } from '../lib/sessionTracker';

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
  hasPermission: (perm: string) => boolean;
  canAccessSegment: (slug: string) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'nkt_user_session';
const AUTH_TIMEOUT_MS = 15000; // 15s hard cap on any supabase call in the auth flow

// Wrap any thenable (Supabase's builder is thenable but not a real Promise) with a
// timeout so a broken/slow Supabase call never hangs the UI forever.
function withTimeout<T>(p: PromiseLike<T>, ms = AUTH_TIMEOUT_MS, label = 'request'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out — please check your connection and try again`)), ms);
    Promise.resolve(p).then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

async function fetchAppUser(userId: string): Promise<AppUser | null> {
  let retries = 4;
  let delay = 250;
  
  while (retries > 0) {
    const { data, error } = await withTimeout(
      supabase.from('app_users').select('*').eq('id', userId).maybeSingle(),
      AUTH_TIMEOUT_MS,
      'user profile'
    );
    
    if (error) throw error; // Let network errors throw
    
    if (data) {
      if (data.is_active === false) return null; // Disabled
      return data as AppUser;
    }
    
    // data is null, which often happens immediately after sign-in because the PostgREST
    // client hasn't caught up with the Supabase Auth token yet, so RLS blocks the query.
    // We wait and retry to avoid aggressively signing out a valid user.
    retries--;
    if (retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      delay *= 2; // exponential backoff: 250ms, 500ms, 1000ms
    }
  }
  
  return null; // Not found after retries
}

async function fetchRolePermissions(role: string): Promise<Record<string, boolean>> {
  try {
    const { data } = await withTimeout(
      supabase.from('role_permissions').select('permissions').eq('role_name', role).maybeSingle(),
      AUTH_TIMEOUT_MS,
      'permissions'
    );
    return (data?.permissions as Record<string, boolean>) ?? {};
  } catch {
    return {};
  }
}

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

  // signIn() and the onAuthStateChange(SIGNED_IN) listener both fire for the
  // same login and independently used to call loadUser(). Each one retries
  // its own DB read to work around the RLS-propagation delay right after
  // sign-in, and signs the user out on failure — so if the two independent
  // retry loops ever disagreed (one succeeds, the other's retries exhaust),
  // the failing copy would sign out a login that had just succeeded. Sharing
  // one in-flight promise per user id means both callers always get the same
  // outcome instead of racing each other.
  const inFlightLoadRef = useRef<{ userId: string; promise: Promise<AppUser | null> } | null>(null);

  async function loadUser(userId: string): Promise<AppUser | null> {
    const existing = inFlightLoadRef.current;
    if (existing && existing.userId === userId) return existing.promise;

    const promise = (async () => {
      const appUser = await fetchAppUser(userId);
      if (!appUser) return null;
      const rolePerms = appUser.role === 'super_admin'
        ? { all: true }
        : await fetchRolePermissions(appUser.role);
      setUser(appUser);
      const perms = { ...rolePerms, ...(appUser.permission_overrides || {}) };
      setPermissions(perms);
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(appUser));
        localStorage.setItem(SESSION_KEY + '_perms', JSON.stringify(perms));
      } catch { /* storage disabled */ }
      return appUser;
    })();

    inFlightLoadRef.current = { userId, promise };
    try {
      return await promise;
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

  useEffect(() => {
    let mounted = true;

    // Absolute safety net: never let the app hang on a broken Supabase config.
    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, AUTH_TIMEOUT_MS);

    (async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_TIMEOUT_MS,
          'session'
        );
        if (!mounted) return;
        if (session?.user) {
          try {
            const loaded = await loadUser(session.user.id);
            if (!loaded && mounted) {
              clearLocalSession();
              // Only sign out of Supabase if the user is truly disabled (not a network error)
              await supabase.auth.signOut().catch(() => {});
            }
          } catch {
            // Network error -> keep their Supabase token intact so they can just refresh/retry
            if (mounted) clearLocalSession();
          }
        } else {
          // No live session — don't trust localStorage.
          clearLocalSession();
        }
      } catch {
        // Broken config / offline — never grant access.
        if (mounted) clearLocalSession();
      } finally {
        if (mounted) {
          clearTimeout(safetyTimer);
          setLoading(false);
        }
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT' || !session?.user) {
        clearLocalSession();
        return;
      }
      // On SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED — sync the profile.
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        try {
          // Add a tiny delay to allow Supabase Auth to update the PostgREST client headers
          // This prevents a known race condition where the first DB query uses a missing/stale token.
          await new Promise(r => setTimeout(r, 100));
          const loaded = await loadUser(session.user.id);
          if (!loaded && mounted) {
            // TOKEN_REFRESHED/USER_UPDATED fire silently in the background while
            // someone is mid-work with an already-valid session. A transient
            // failure to re-fetch their profile here is not proof the account
            // is gone — only SIGNED_IN (a fresh login with no prior state to
            // trust) should treat a failed fetch as "refuse access." Otherwise
            // a single flaky background refresh would boot an active user
            // straight back to the login screen mid-task.
            if (event === 'SIGNED_IN') {
              clearLocalSession();
              await supabase.auth.signOut().catch(() => {});
            }
          }
        } catch {
          // Network error - only clear session for a fresh sign-in; a background
          // refresh failure should leave the existing session alone.
          if (mounted && event === 'SIGNED_IN') clearLocalSession();
        }
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  // Heartbeat: while a user is signed in, keep our `user_sessions` row alive
  // and force sign-out if it was revoked from another device.
  useEffect(() => {
    if (!user) return;
    let stopped = false;
    let handle: number | undefined;

    async function tick() {
      if (stopped) return;
      // If we somehow don't have a row yet (e.g., session restored from an
      // older tab that predates this feature), create one now so the user
      // still shows up in the devices list.
      if (!getCurrentSessionRowId()) {
        await beginSession(user!.id);
      } else {
        const { revoked } = await heartbeatSession();
        if (revoked && !stopped) {
          await signOut();
          return;
        }
      }
      handle = window.setTimeout(tick, SESSION_HEARTBEAT_MS);
    }

    // Run the first tick after a short delay so we don't hammer Supabase on load.
    handle = window.setTimeout(tick, 3000);
    return () => {
      stopped = true;
      if (handle !== undefined) window.clearTimeout(handle);
    };
    // Intentionally omit signOut — it's stable and referencing it here would
    // re-arm the timer on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const hasPermission = (perm: string) =>
    !!user && (user.role === 'super_admin' || permissions[perm] === true || permissions['all'] === true);

  const canAccessSegment = (slug: string) =>
    !!user && (user.role === 'super_admin' || user.segments?.includes('all') || user.segments?.includes(slug));

  async function signIn(email: string, password: string) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) return { error: 'Enter your email and password.' };
    if (!isSupabaseConfigured) {
      return { error: 'Sign-in is not configured. Please contact your administrator.' };
    }

    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: cleanEmail, password }),
        AUTH_TIMEOUT_MS,
        'sign-in'
      );

      if (error) {
        logLoginFailed(cleanEmail);
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('invalid') && msg.includes('credentials')) {
          return { error: 'Incorrect email or password.' };
        }
        if (msg.includes('email not confirmed')) {
          return { error: 'Please confirm your email before signing in.' };
        }
        if (msg.includes('rate limit') || msg.includes('too many')) {
          return { error: 'Too many attempts. Please wait a minute and try again.' };
        }
        return { error: error.message || 'Sign-in failed. Please try again.' };
      }

      if (!data?.user) {
        return { error: 'Sign-in failed. Please try again.' };
      }

      logLogin(data.user.email || cleanEmail);
      let appUser: AppUser | null = null;
      try {
        appUser = await loadUser(data.user.id);
      } catch {
        return { error: 'Network error while loading profile. Please try again.' };
      }

      if (!appUser) {
        // Auth passed but this identity has no active app_users row — refuse access.
        await supabase.auth.signOut().catch(() => {});
        clearLocalSession();
        return { error: 'Your account is not active. Please contact your administrator.' };
      }
      // Register this browser as a device on the user's account so they can
      // see and revoke it from the Session Devices panel.
      await beginSession(data.user.id);
      return { error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
      return { error: message };
    }
  }

  async function signOut() {
    const wasEmail = user?.email;
    // Clear local UI/localStorage state up front. Logout must never depend on
    // a network round-trip completing — endSession()/supabase.auth.signOut()
    // below had no timeout, so a hung request left the browser stuck in a
    // half-signed-out state (stale `nkt_user_session` still in localStorage)
    // that persisted across hard refreshes, since the app trusts that cache
    // as a fast-path hint on load.
    clearLocalSession();
    try {
      if (wasEmail) logLogout(wasEmail);
      // Mark our device row as revoked before dropping the auth session.
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
      // ignore — keep whatever we already have on transient errors
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
