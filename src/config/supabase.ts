// Kept only so existing `import { supabase } from '../config/supabase'` calls
// across the app (AuthContext.tsx, apiService.ts, ...) keep working without
// touching every file. The real, typed client now lives in
// src/lib/supabaseClient.ts — re-exporting here (instead of calling
// createClient() a second time) avoids the "Multiple GoTrueClient instances"
// warning/bugs that come from two separate client instances sharing storage.
//
// New code should import directly from '../lib/supabaseClient' instead.
export { supabase, isSupabaseConfigured } from '../lib/supabaseClient';