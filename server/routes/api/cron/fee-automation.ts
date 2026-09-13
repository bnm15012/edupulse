import { defineEventHandler, getHeader, createError } from "h3";

/**
 * Vercel Cron endpoint: runs fee automation for all schools daily at midnight IST.
 * Schedule is defined in vercel.json.
 * Secured by CRON_SECRET env var (set in Vercel project settings).
 */
export default defineEventHandler(async (event) => {
  // Verify the request is from Vercel Cron
  const authHeader = getHeader(event, "authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    throw createError({ statusCode: 401, message: "Unauthorized" });
  }

  const { db } = await import("../../../src/lib/db");
  const { schools, locations } = await import("../../../src/lib/db/schema");
  const { runFeeAutomationCore } = await import("../../../src/lib/auth");
  const { eq, and } = await import("drizzle-orm");

  // Get all active school+location pairs
  const rows = await db
    .select({ schoolId: locations.schoolId, locationId: locations.id })
    .from(locations)
    .innerJoin(schools, eq(locations.schoolId, schools.id))
    .where(eq(locations.status, "active"));

  let totalGenerated = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const result = await runFeeAutomationCore(row.schoolId, row.locationId);
      totalGenerated += result.generated;
    } catch (err: any) {
      errors.push(`school=${row.schoolId} loc=${row.locationId}: ${err?.message ?? err}`);
    }
  }

  return {
    ok: true,
    processed: rows.length,
    generated: totalGenerated,
    errors,
    timestamp: new Date().toISOString(),
  };
});
