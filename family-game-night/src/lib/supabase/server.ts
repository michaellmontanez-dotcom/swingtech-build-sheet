import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE, requireServiceConfig } from "@/lib/env";

// Server (service-role) client — bypasses RLS. ONLY used in route handlers to
// perform authoritative reads/writes. Never expose to the browser.
export function getServiceSupabase(): SupabaseClient {
  requireServiceConfig();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
