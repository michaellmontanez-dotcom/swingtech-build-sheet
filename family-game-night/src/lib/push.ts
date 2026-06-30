import "server-only";
import webpush from "web-push";
import { getServiceSupabase } from "@/lib/supabase/server";
import { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, isPushConfigured } from "@/lib/env";

let configured = false;
function ensure() {
  if (!isPushConfigured) return false;
  if (!configured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

// Send a notification to every device a player has registered. Dead
// subscriptions (410/404) are pruned. Best-effort: never throws.
export async function pushToPlayer(
  playerId: string,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  if (!ensure() || !playerId) return;
  const db = getServiceSupabase();
  const { data: subs } = await db
    .from("push_subscriptions")
    .select("endpoint, data")
    .eq("player_id", playerId);
  if (!subs?.length) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.data as webpush.PushSubscription, body);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").delete().eq("player_id", playerId).eq("endpoint", row.endpoint);
        }
      }
    })
  );
}
