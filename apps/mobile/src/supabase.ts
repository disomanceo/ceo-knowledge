import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || 'https://pcvdtcntyzndhfxfawbo.supabase.co';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_YHxm-J_CHXUpQJGCL057GQ_ny6UKIgX';

if (!anonKey && import.meta.env.DEV) console.warn('VITE_SUPABASE_ANON_KEY is not configured');

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'ceo-mobile-auth',
  },
});
