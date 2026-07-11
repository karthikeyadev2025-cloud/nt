import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Untyped client — regenerate strict types with `supabase gen types typescript`
// once the new project is live, then re-add the <Database> generic.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
