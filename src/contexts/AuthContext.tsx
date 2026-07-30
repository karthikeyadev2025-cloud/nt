import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
  try {
    const { data, error } = await withTimeout(
      supabase.from('app_users').select('*').eq('id', userId).maybeSingle(),
      AUTH_TIMEOUT_MS,
      'user profile'
    );
    if (error || !data) return null;
    if (data.is_active === false) return null;
    return data as AppUser;
  } catch {
    return null;
  }
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
  const [user, setUser] = useState<AppUser | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  // Start true — we're about to check the session. AppContent shows a loader while this is true.
  const [loading, setLoading] = useState(true);

  async function loadUser(userId: string): Promise<AppUser | null> {
    const appUser = await fetchAppUser(userId);
    if (!appUser) return null;
    const rolePerms = appUser.role === 'super_admin'
      ? { all: true }
      : await fetchRolePermissions(appUser.role);
    setUser(appUser);
    setPermissions({ ...rolePerms, ...(appUser.permission_overrides || {}) });
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(appUser)); } catch { /* storage disabled */ }
    return appUser;
  }

  function clearLocalSession() {
    setUser(null);
    setPermissions({});
    try { localStorage.removeItem(SESSION_KEY); } catch { /* storage disabled */ }
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
          const loaded = await loadUser(session.user.id);
          if (!loaded && mounted) clearLocalSession();
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
        const loaded = await loadUser(session.user.id);
        if (!loaded && mounted) {
          clearLocalSession();
          await supabase.auth.signOut().catch(() => {});
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
      const appUser = await loadUser(data.user.id);
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
    try {
      if (user) logLogout(user.email);
      // Mark our device row as revoked before dropping the auth session.
      await endSession();
      await supabase.auth.signOut().catch(() => {});
    } finally {
      clearLocalSession();
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
