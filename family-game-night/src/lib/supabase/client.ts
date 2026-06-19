"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "@/lib/env";

let browserClient: SupabaseClient | null = null;

// Browser (anon) client — used for Realtime subscriptions + presence + public reads.
export function getBrowserSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  if (!browserClient) {
    browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 20 } },
      auth: { persistSession: false },
    });
  }
  return browserClient;
}

export { isSupabaseConfigured };
