/**
 * @module lib/supabase
 * @description Initializes and exports the Supabase client singleton.
 * Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from environment variables
 * (set in `.env.local`). Throws at startup if either is missing.
 * Strips any trailing `/rest/v1` suffix from the URL to normalize the endpoint.
 */
import { createClient } from '@supabase/supabase-js';

let supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
supabaseUrl = supabaseUrl.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env.local');
}

/** Supabase client instance used throughout the application for auth and data sync. */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
