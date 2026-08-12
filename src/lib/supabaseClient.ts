import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Whether the required Supabase environment variables are present.
 * Consumed by main.tsx to show a clear configuration-error screen instead of
 * letting a missing env crash the app at module-load time (a missing env
 * previously produced a blank white screen with no explanation).
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // Never throw at import time — that happens before React (and the
  // ErrorBoundary) ever mounts. Log clearly instead; main.tsx renders the
  // user-facing message.
  // eslint-disable-next-line no-console
  console.error(
    '[ShareRide] Supabase configuration is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

// Fall back to harmless placeholder values so createClient() never throws at
// import time. Every real request will simply fail with a network/auth
// error, which the try/catch blocks in the service layer already handle.
export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);