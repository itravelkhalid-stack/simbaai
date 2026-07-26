import { config } from "dotenv";
config({ path: ".env.local" });
import pg from "pg";
import { getZonedParts } from "../lib/meetings/timezone";
import { statusBlocksScheduleSlot } from "../lib/meetings/schedule-policy";
import { parseMeetingsSettings } from "../lib/meetings/settings";
import type { MeetingStatus } from "../lib/types/meetings";

async function main() {
  const c = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const settings = parseMeetingsSettings({});
  const tomorrow = new Date("2026-07-27T06:05:00.000Z");
  const z = getZonedParts(tomorrow, settings.timezone);
  console.log("tomorrow probe", {
    utc: tomorrow.toISOString(),
    londonHour: z.hour,
    dateKey: z.dateKey,
    due: z.hour === settings.daily_standup_hour,
  });

  const brands = await c.query<{ id: string; organization_id: string }>(
    "select id, organization_id from brands",
  );

  for (const brand of brands.rows) {
    const dayStart = `${z.dateKey}T00:00:00.000Z`;
    const next = new Date(dayStart);
    next.setUTCDate(next.getUTCDate() + 2);
    const { rows } = await c.query<{
      id: string;
      type: string;
      status: string;
      scheduled_for: string;
    }>(
      `select id, type, status, scheduled_for from meetings
       where organization_id=$1 and brand_id=$2 and type='daily_standup'
         and scheduled_for >= $3 and scheduled_for < $4`,
      [brand.organization_id, brand.id, dayStart, next.toISOString()],
    );
    const blocking = rows.filter((r) => {
      if (!statusBlocksScheduleSlot(r.status as MeetingStatus)) return false;
      return (
        getZonedParts(new Date(r.scheduled_for), settings.timezone).dateKey ===
        z.dateKey
      );
    });
    const todayFailed = await c.query<{
      status: string;
      scheduled_for: string;
    }>(
      `select status, scheduled_for from meetings
       where brand_id=$1 and type='daily_standup'
         and scheduled_for >= '2026-07-26T00:00:00Z'
         and scheduled_for < '2026-07-27T00:00:00Z'
       order by created_at`,
      [brand.id],
    );
    console.log("brand", brand.id.slice(0, 8));
    console.log("  rows in tomorrow window", rows);
    console.log("  blocking tomorrow?", blocking.length > 0, blocking);
    console.log(
      "  today 2026-07-26 rows",
      todayFailed.rows.map((r) => ({
        status: r.status,
        at: r.scheduled_for,
        blocks: statusBlocksScheduleSlot(r.status as MeetingStatus),
      })),
    );
    console.log(
      "  WOULD CREATE at 06:05 UTC tomorrow?",
      blocking.length === 0 && z.hour === settings.daily_standup_hour,
    );
  }

  const today = new Date("2026-07-26T06:05:00.000Z");
  const zt = getZonedParts(today, settings.timezone);
  for (const brand of brands.rows) {
    const dayStart = `${zt.dateKey}T00:00:00.000Z`;
    const next = new Date(dayStart);
    next.setUTCDate(next.getUTCDate() + 2);
    const { rows } = await c.query<{ status: string; scheduled_for: string }>(
      `select status, scheduled_for from meetings
       where brand_id=$1 and type='daily_standup'
         and scheduled_for >= $2 and scheduled_for < $3`,
      [brand.id, dayStart, next.toISOString()],
    );
    const oldDedupe = rows.some(
      (r) =>
        getZonedParts(new Date(r.scheduled_for), settings.timezone).dateKey ===
        zt.dateKey,
    );
    const newDedupe = rows.some(
      (r) =>
        statusBlocksScheduleSlot(r.status as MeetingStatus) &&
        getZonedParts(new Date(r.scheduled_for), settings.timezone).dateKey ===
          zt.dateKey,
    );
    console.log("retro today 06:05:", {
      oldDedupeWouldSkip: oldDedupe,
      newDedupeWouldSkip: newDedupe,
      wouldCreate: !newDedupe,
    });
  }

  const col = await c.query(
    `select column_name from information_schema.columns
     where table_name='meetings' and column_name='generation_attempts'`,
  );
  console.log("generation_attempts column", col.rows);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
