// Reads Supabase config from env, accepting both NEXT_PUBLIC_* and bare names so
// it works whether you set one pair or both in Vercel/Supabase.

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

// Server-only. Never import this into a client component.
export const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// --- Web Push (turn notifications) -----------------------------------------
// The PUBLIC key is safe to ship to the browser and is baked in as a default so
// only the secret private key needs configuring. Override either via env.
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BJR-5mzDEJbXMERBlIoLVpnCkKLcOtyVLgC6QNhTd2Qs3NkY7c3Kq3Gw-6ERjPsOlUHP-LfZvKAoBBWfWyQkWqc";
// Secret — server only. Push sending is disabled until this is set.
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:games@example.com";
export const isPushConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

export function requireServiceConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    throw new Error(
      "Supabase server env not set. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE."
    );
  }
}
