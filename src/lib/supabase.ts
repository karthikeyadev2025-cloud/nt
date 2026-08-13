import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// A single flag the rest of the app can rely on to know whether real credentials are present.
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey &&
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('YOUR-NEW-PROJECT') &&
  !supabaseUrl.includes('placeholder') &&
  supabaseAnonKey.length > 40 &&
  supabaseAnonKey !== 'YOUR-ANON-KEY' &&
  !supabaseAnonKey.startsWith('REPLACE_ME') &&
  !supabaseAnonKey.includes('placeholder')
);

if (!isSupabaseConfigured) {
  // Loud, once-only warning — the app will refuse sign-in until this is fixed.
  console.error(
    '[Nikki] Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env, then restart the dev server.'
  );
}

// We still create a client (with harmless placeholders if unconfigured) so imports don't crash;
// AuthContext gates real calls behind `isSupabaseConfigured`.
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
