import { NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE } from "@/lib/env";
import { getServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Visit /api/health in a browser to confirm the deploy is wired up. Reports only
// booleans + the deployed commit (NO secret values), plus a live service-role
// query so you can tell instantly whether the keys/database actually work.
export async function GET() {
  const env = {
    supabaseUrl: Boolean(SUPABASE_URL),
    anonKey: Boolean(SUPABASE_ANON_KEY),
    serviceRole: Boolean(SUPABASE_SERVICE_ROLE),
  };

  let database: "ok" | "error" | "skipped" = "skipped";
  let databaseError: string | null = null;
  if (env.supabaseUrl && env.serviceRole) {
    try {
      const sb = getServiceSupabase();
      const { error } = await sb.from("rooms").select("id", { count: "exact", head: true });
      database = error ? "error" : "ok";
      databaseError = error?.message ?? null;
    } catch (e) {
      database = "error";
      databaseError = (e as Error).message;
    }
  }

  return NextResponse.json({
    ok: env.supabaseUrl && env.anonKey && env.serviceRole && database === "ok",
    env,
    database,
    databaseError,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    deployedAt: new Date().toISOString(),
  });
}
