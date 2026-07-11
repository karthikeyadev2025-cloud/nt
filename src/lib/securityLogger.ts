import { supabase } from './supabase';

async function log(event_type: string, user_email: string, details: Record<string, unknown> = {}) {
  try {
    await supabase.from('security_audit_logs').insert({
      user_email,
      event_type,
      details,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    });
  } catch {
    // never block auth flow on logging
  }
}

export const logLogin = (email: string) => log('login_success', email);
export const logLoginFailed = (email: string) => log('login_failed', email);
export const logLogout = (email: string) => log('logout', email);
