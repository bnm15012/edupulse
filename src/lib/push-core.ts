import { and, eq } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/lib/db";
import { users, pushSubscriptions } from "@/lib/db/schema";

export function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured");
  }
  return { publicKey, privateKey };
}

export async function broadcastPush(
  title: string,
  body: string,
  url: string,
  targetSchoolId?: number,
  targetLocationId?: number,
  targetRole?: string
) {
  const { publicKey, privateKey } = getVapidConfig();
  webpush.setVapidDetails("mailto:admin@edupulse.in", publicKey, privateKey);

  const conditions = [];
  if (targetSchoolId != null) conditions.push(eq(users.schoolId, targetSchoolId));
  if (targetLocationId != null) conditions.push(eq(users.locationId, targetLocationId));
  if (targetRole != null && targetRole !== "all") conditions.push(eq(users.role, targetRole));

  const base = db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .innerJoin(users, eq(users.id, pushSubscriptions.userId));

  const subs = conditions.length
    ? await base.where(and(...conditions))
    : await base;

  let sent = 0;
  let removed = 0;

  for (const sub of subs) {
    const pushSub = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    } as any;
    try {
      await webpush.sendNotification(
        pushSub,
        JSON.stringify({
          title,
          body,
          url,
          icon: "/icon-192.png",
        })
      );
      sent++;
    } catch (e: any) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        removed++;
      } else {
        console.error("webpush failed for", sub.endpoint, "status:", e.statusCode, "error:", e);
      }
    }
  }

  console.log("broadcastPush:", { title, total: subs.length, sent, removed, targetSchoolId, targetLocationId, targetRole });
  return { sent, removed, total: subs.length };
}
