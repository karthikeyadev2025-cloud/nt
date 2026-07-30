import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ohprabgcstqwswbcthjs.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl) {
  console.warn('VITE_SUPABASE_URL is not set. Falling back to default project URL.');
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey || 'dummy-key-placeholder'
);
