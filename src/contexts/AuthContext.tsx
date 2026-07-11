import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { logLogin, logLogout } from '../lib/securityLogger';

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
  profile_photo_url?: string | null;
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

async function fetchAppUser(userId: string): Promise<AppUser | null> {
  const { data } = await supabase.from('app_users').select('*').eq('id', userId).maybeSingle();
  return (data as AppUser) ?? null;
}

async function fetchRolePermissions(role: string): Promise<Record<string, boolean>> {
  const { data } = await supabase
    .from('role_permissions').select('permissions').eq('role_name', role).maybeSingle();
  return (data?.permissions as Record<string, boolean>) ?? {};
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  async function loadUser(userId: string) {
    const appUser = await fetchAppUser(userId);
    if (!appUser || !appUser.is_active) {
      await supabase.auth.signOut();
      setUser(null); setPermissions({});
      return;
    }
    const rolePerms = await fetchRolePermissions(appUser.role);
    setUser(appUser);
    setPermissions({ ...rolePerms, ...(appUser.permission_overrides || {}) });
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) await loadUser(session.user.id);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) await loadUser(session.user.id);
      else { setUser(null); setPermissions({}); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const hasPermission = (perm: string) =>
    !!user && (user.role === 'super_admin' || permissions[perm] === true || permissions['all'] === true);

  const canAccessSegment = (slug: string) =>
    !!user && (user.role === 'super_admin' || user.segments.includes('all') || user.segments.includes(slug));

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (data.user) {
      const appUser = await fetchAppUser(data.user.id);
      if (!appUser || !appUser.is_active) {
        await supabase.auth.signOut();
        return { error: 'Your account is disabled. Contact admin.' };
      }
      logLogin(appUser.email);
      await loadUser(data.user.id);
    }
    return { error: null };
  }

  async function signOut() {
    if (user) logLogout(user.email);
    await supabase.auth.signOut();
    setUser(null); setPermissions({});
  }

  async function refreshUser() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) await loadUser(session.user.id);
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
