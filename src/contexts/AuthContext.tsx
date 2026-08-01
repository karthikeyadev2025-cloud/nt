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
  // True only once the REAL supabase.auth.getSession() has resolved at least
  // once (success or failure — either way, we've heard back from the actual
  // client). `loading` alone is NOT enough: it goes false immediately when a
  // cached session exists (see below), specifically so a returning user sees
  // their UI instantly instead of a loading flash. That's good for the shell
  // — but every dashboard component fires its own data queries on mount, and
  // if those fire before the real client has attached its session token,
  // RLS-protected tables return an empty result (not an error) rather than
  // throwing — which looks exactly like "logged in but no data visible",
  // and was happening on essentially every refresh for a returning user.
  // Consumers that fetch real data should wait for sessionReady, not just
  // `!loading` — see App.tsx.
  sessionReady: boolean;
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

// Return contract — the whole "logs out on every refresh" bug lived in the old
// ambiguity here, so it's now explicit:
//   • returns AppUser  → active, valid profile.
//   • returns null      → the row was read AND is_active === false, i.e. the
//                         account is DEFINITIVELY disabled. Only this case
//                         should ever cause a sign-out.
//   • throws            → transient / ambiguous: a network error, a timeout, or
//                         the row simply wasn't visible yet after retries (the
//                         PostgREST client hadn't caught up with the auth token,
//                         so RLS returned nothing). On a page refresh this is
//                         almost always momentary token-propagation lag — NOT
//                         proof the account is gone. Callers treat a throw as
//                         "keep the current session" and never sign out on it.
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
      // Network / timeout — retry, and if we've exhausted retries, throw so the
      // caller keeps the session rather than signing out.
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
      if ((data as AppUser).is_active === false) return null; // definitively disabled → deny
      return data as AppUser;
    }

    // Query succeeded but returned no row — usually RLS token-propagation lag
    // right after sign-in / refresh. Wait and retry.
    retries--;
    if (retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      delay *= 2; // exponential backoff: 250ms, 500ms, 1000ms, 2000ms
    }
  }

  // Exhausted retries without ever getting a definitive answer (row visible, or
  // disabled). Ambiguous — treat as transient so the caller keeps the existing
  // session instead of aggressively signing the user out on a refresh.
  throw new Error('Profile not visible yet — keeping existing session.');
}

// A silent failure here has an outsized, easy-to-miss impact: it doesn't
// block login, it just quietly leaves the user with permissions = {} —
// every hasPermission() check then returns false, so their role-specific
// dashboard tabs (tickets/leads/team/admin console) simply don't show, with
// no error surfaced anywhere. That looks exactly like "staff can't see
// their role's dashboard" rather than like a failed request. Retrying
// (matching the same pattern already used for the profile fetch) means a
// single transient blip doesn't silently strip someone's permissions until
// their next full login.
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
      if (data) return (data.permissions as Record<string, boolean>) ?? {};
      // No row for this role — not a transient error, retrying won't help.
      return {};
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
  // Deliberately does NOT share the cache fast-path above — this only flips
  // true once the real getSession() round-trip has actually completed.
  const [sessionReady, setSessionReady] = useState(false);

  // signIn() and the onAuthStateChange(SIGNED_IN) listener both fire for the
  // same login and independently used to call loadUser(). Each one retries
  // its own DB read to work around the RLS-propagation delay right after
  // sign-in, and signs the user out on failure — so if the two independent
  // retry loops ever disagreed (one succeeds, the other's retries exhaust),
  // the failing copy would sign out a login that had just succeeded. Sharing
  // one in-flight promise per user id means both callers always get the same
  // outcome instead of racing each other.
  //
  // That alone doesn't catch every duplicate, though: the SIGNED_IN listener
  // waits a fixed 100ms before calling loadUser (to dodge a token-propagation
  // race), and on any reasonably fast connection signIn()'s own call has
  // already finished well within that 100ms — so by the time the listener's
  // call arrives, there's no in-flight promise left to share, and it just
  // fires a second, fully redundant fetch of the exact same profile. Caching
  // the resolved result for a couple of seconds after completion (not just
  // while in-flight) catches that case too, since a profile that's a couple
  // seconds stale is still correct.
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
      const result = await promise;
      // Only cache a SUCCESSFUL (non-null) load. Caching a null would let a
      // single transient/disabled read get replayed to every other caller
      // inside the 2s window, amplifying one blip into a definite sign-out.
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

  useEffect(() => {
    let mounted = true;

    // Absolute safety net: never let the app hang on a broken Supabase config
    // or a stalled network. Releases BOTH loading and sessionReady — we've
    // decided we're done trying, so the app proceeds with whatever cached
    // state exists. Missing setSessionReady(true) here left the app stuck on
    // PageLoader indefinitely for any user whose initial getSession() hung
    // past this timeout (common on slow mobile connections) — a real hard
    // hang until they closed the tab.
    const safetyTimer = setTimeout(() => {
      if (mounted) {
        setLoading(false);
        setSessionReady(true);
      }
    }, AUTH_TIMEOUT_MS);

    (async () => {
      let session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] = null;
      let getSessionFailed = false;
      try {
        ({ data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_TIMEOUT_MS,
          'session'
        ));
      } catch {
        // getSession itself failed — a timeout or network blip. On a refresh
        // (especially on a slow phone connection) this can happen even though
        // the stored session is perfectly valid, because getSession may kick
        // off a token-refresh network round-trip. We CANNOT confirm the
        // session, but we also can't disprove it — so if there's a cached
        // user, KEEP them logged in rather than booting them to the login
        // screen. A later onAuthStateChange event, or the next load,
        // reconciles. This is the other half of the "logs out on refresh" fix.
        getSessionFailed = true;
      }

      if (!mounted) { clearTimeout(safetyTimer); return; }

      try {
        if (getSessionFailed) {
          // Do nothing — leave the cached user (set from localStorage on mount)
          // and the stored tokens untouched.
        } else if (session?.user) {
          try {
            const loaded = await loadUser(session.user.id);
            // loadUser returns null ONLY for a definitively disabled account —
            // the one case worth signing out on during a refresh.
            if (loaded === null && mounted) {
              clearLocalSession();
              await supabase.auth.signOut().catch(() => {});
            }
          } catch {
            // Transient / ambiguous profile read — keep the cached user + valid
            // session. A momentary empty read no longer boots anyone to login.
          }
        } else {
          // getSession DEFINITIVELY returned no session — the tokens are gone.
          // This is a real, legitimate logged-out state.
          clearLocalSession();
        }
      } finally {
        if (mounted) {
          clearTimeout(safetyTimer);
          setLoading(false);
          setSessionReady(true);
        }
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      // ONLY react to an EXPLICIT sign-out event here. The old condition also
      // triggered on `!session?.user`, which matched the INITIAL_SESSION event
      // that Supabase fires early during page load — and on a slow connection
      // (or when hydration from local storage hadn't finished at that instant)
      // the session was momentarily null even though a real session existed
      // in storage. That cleared the local user, and if the person happened
      // to be on /portal or /admin, App.tsx immediately showed the login
      // screen — the "flash of login page on refresh" and the "randomly
      // logged out" symptoms.
      //
      // The initial-load path (the async IIFE above) is the ONE place that's
      // authoritative for deciding whether a session actually exists; if it
      // doesn't, it calls clearLocalSession() there. This listener now only
      // handles user-initiated sign-out and post-sign-in profile sync.
      if (event === 'SIGNED_OUT') {
        clearLocalSession();
        return;
      }
      // On SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED — sync the profile.
      // (INITIAL_SESSION is intentionally ignored: the IIFE above already
      // handled it authoritatively before this listener registered.)
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
        try {
          // Add a tiny delay to allow Supabase Auth to update the PostgREST client headers
          // This prevents a known race condition where the first DB query uses a missing/stale token.
          await new Promise(r => setTimeout(r, 100));
          const loaded = await loadUser(session.user.id);
          // loaded === null means a DEFINITIVELY disabled account. TOKEN_REFRESHED
          // / USER_UPDATED fire silently in the background mid-work, so only a
          // fresh SIGNED_IN should act on it. A transient failure throws instead
          // (caught below) and never signs anyone out.
          if (loaded === null && mounted && event === 'SIGNED_IN') {
            clearLocalSession();
            await supabase.auth.signOut().catch(() => {});
          }
        } catch {
          // Transient / ambiguous re-fetch failure — leave the existing session
          // entirely alone, for every event including a fresh sign-in (signIn()
          // itself already surfaces a retriable error to the user in that case).
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
    // Require the row to come back revoked on TWO consecutive polls before
    // actually signing out. This heartbeat is the ONLY thing that force-logs-
    // out an actively-working user, so a single racy/transient read (right
    // after a token refresh, a brief RLS blip, or a momentary network error
    // that heartbeatSession swallows) must never be enough to kick someone
    // mid-task. A genuinely revoked session still gets signed out — just one
    // heartbeat interval later, which is fine for the "kill a stolen session"
    // use case.
    let consecutiveRevoked = 0;

    async function tick() {
      if (stopped) return;
      // If we somehow don't have a row yet (e.g., session restored from an
      // older tab that predates this feature), create one now so the user
      // still shows up in the devices list.
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
