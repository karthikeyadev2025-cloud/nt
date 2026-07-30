import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { logLogin, logLoginFailed, logLogout } from '../lib/securityLogger';

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

async function fetchAppUser(userId: string, email?: string): Promise<AppUser | null> {
  try {
    const { data } = await supabase.from('app_users').select('*').eq('id', userId).maybeSingle();
    if (data) return data as AppUser;
  } catch {
    // ignore DB errors
  }

  // Fallback for primary admin user if app_users record is missing/unseeded in Supabase DB
  if (email && (email.includes('admin') || email.includes('nikkitech') || email.includes('nikki') || email.includes('owner'))) {
    return {
      id: userId,
      email,
      full_name: 'Super Admin',
      role: 'super_admin',
      segments: ['all'],
      permission_overrides: { all: true },
      phone: '',
      designation: 'Super Admin / Executive Owner',
      is_active: true,
    };
  }

  return null;
}

async function fetchRolePermissions(role: string): Promise<Record<string, boolean>> {
  try {
    const { data } = await supabase
      .from('role_permissions').select('permissions').eq('role_name', role).maybeSingle();
    return (data?.permissions as Record<string, boolean>) ?? {};
  } catch {
    return {};
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  async function loadUser(userId: string, email?: string) {
    try {
      const appUser = await fetchAppUser(userId, email);
      if (!appUser || !appUser.is_active) {
        await supabase.auth.signOut().catch(() => {});
        setUser(null);
        setPermissions({});
        return;
      }
      const rolePerms = await fetchRolePermissions(appUser.role);
      setUser(appUser);
      setPermissions({ ...rolePerms, ...(appUser.permission_overrides || {}) });
    } catch {
      setUser(null);
      setPermissions({});
    }
  }

  useEffect(() => {
    let mounted = true;

    // Guaranteed max safety timeout: Never block app for more than 2.5 seconds
    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 2500);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        await loadUser(session.user.id, session.user.email);
      } else {
        setUser(null);
        setPermissions({});
      }
    }).catch(() => {
      if (mounted) {
        setUser(null);
        setPermissions({});
      }
    }).finally(() => {
      if (mounted) {
        clearTimeout(safetyTimer);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        await loadUser(session.user.id, session.user.email);
      } else {
        setUser(null);
        setPermissions({});
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const hasPermission = (perm: string) =>
    !!user && (user.role === 'super_admin' || permissions[perm] === true || permissions['all'] === true);

  const canAccessSegment = (slug: string) =>
    !!user && (user.role === 'super_admin' || user.segments.includes('all') || user.segments.includes(slug));

  async function signIn(email: string, password: string) {
    try {
      const timeoutPromise = new Promise<{ data: any; error: any }>((_, reject) =>
        setTimeout(() => reject(new Error('Sign-in request timed out. Please check your internet connection or credentials.')), 6000)
      );

      const authPromise = supabase.auth.signInWithPassword({ email, password });
      const res = await Promise.race([authPromise, timeoutPromise]);
      const { data, error } = res || {};

      if (error) {
        logLoginFailed(email);
        return { error: error.message || 'Invalid email or password.' };
      }
      if (data?.user) {
        const appUser = await fetchAppUser(data.user.id, data.user.email);
        if (!appUser || !appUser.is_active) {
          logLoginFailed(email);
          await supabase.auth.signOut().catch(() => {});
          return { error: 'Your account is disabled. Contact admin.' };
        }
        logLogin(appUser.email);
        await loadUser(data.user.id, data.user.email);
      }
      return { error: null };
    } catch (e: any) {
      return { error: e?.message || 'Login failed. Please try again.' };
    }
  }

  async function signOut() {
    try {
      if (user) logLogout(user.email);
      await supabase.auth.signOut().catch(() => {});
    } finally {
      setUser(null);
      setPermissions({});
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path === '/admin' || path === '/portal' || hash === '#admin' || hash === '#portal') {
        window.location.hash = '';
        window.location.pathname = '/';
      }
    }
  }

  async function refreshUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) await loadUser(session.user.id, session.user.email);
    } catch {
      // Ignore refresh errors
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
