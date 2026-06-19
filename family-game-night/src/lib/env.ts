// Reads Supabase config from env, accepting both NEXT_PUBLIC_* and bare names so
// it works whether you set one pair or both in Vercel/Supabase.

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

// Server-only. Never import this into a client component.
export const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export function requireServiceConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    throw new Error(
      "Supabase server env not set. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE."
    );
  }
}
