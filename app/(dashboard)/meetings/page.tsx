import Link from "next/link";

import { MeetingsNav } from "@/components/meetings/meetings-nav";
import { RunMeetingForm } from "@/components/meetings/run-meeting-form";
import { previewUpcomingMeetings } from "@/lib/meetings/schedule";
import { parseMeetingsSettings } from "@/lib/meetings/settings";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import {
  MEETING_TYPE_LABELS,
  type Meeting,
} from "@/lib/types/meetings";

export default async function MeetingsFeedPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const [{ data: meetings }, { data: brands }, { data: org }] = await Promise.all([
    supabase
      .from("meetings")
      .select("*")
      .eq("organization_id", active.organization_id)
      .order("scheduled_for", { ascending: false })
      .limit(50),
    supabase
      .from("brands")
      .select("id, name")
      .eq("organization_id", active.organization_id)
      .order("name"),
    supabase
      .from("organizations")
      .select("settings")
      .eq("id", active.organization_id)
      .single(),
  ]);

  const brandMap = new Map((brands ?? []).map((b) => [b.id, b.name]));
  const settings = parseMeetingsSettings(
    org?.settings as Record<string, unknown>,
  );
  const upcoming = previewUpcomingMeetings({
    settings,
    brandIds: (brands ?? []).map((b) => b.id),
    hoursAhead: 24 * 21,
  }).slice(0, 24);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Meetings</h1>
        <p className="mt-2 text-muted-foreground">
          AI standups, weekly panels, board packs, and annual reviews — with typed
          actions and live KPI context ({settings.timezone}).
        </p>
      </div>
      <MeetingsNav current="/meetings" />
      <RunMeetingForm brands={brands ?? []} />

      <div className="rounded-xl border">
        <div className="border-b p-3 text-sm font-medium">
          Upcoming scheduled ({settings.timezone})
        </div>
        <ul className="divide-y">
          {upcoming.length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">
              No upcoming slots in the next 3 weeks. Check Meetings → Schedule.
            </li>
          ) : (
            upcoming.map((slot) => (
              <li
                key={`${slot.brandId}-${slot.type}-${slot.dateKey}`}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{MEETING_TYPE_LABELS[slot.type]}</p>
                  <p className="text-muted-foreground">
                    {brandMap.get(slot.brandId) ?? "Brand"} · {slot.dateKey} ·{" "}
                    {new Date(slot.at).toLocaleString()}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">scheduled</span>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="rounded-xl border">
        <div className="border-b p-3 text-sm font-medium">Past &amp; recent meetings</div>
        <ul className="divide-y">
          {((meetings ?? []) as Meeting[]).length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">
              No meetings yet. They schedule automatically per brand, or queue one above.
            </li>
          ) : (
            ((meetings ?? []) as Meeting[]).map((meeting) => (
              <li
                key={meeting.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <div>
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className="font-medium underline"
                  >
                    {meeting.title}
                  </Link>
                  <p className="text-muted-foreground">
                    {MEETING_TYPE_LABELS[meeting.type]} ·{" "}
                    {brandMap.get(meeting.brand_id) ?? "Brand"} ·{" "}
                    {new Date(meeting.scheduled_for).toLocaleString()} ·{" "}
                    {meeting.status}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {meeting.escalation_flagged ? (
                    <span className="text-destructive">Escalation</span>
                  ) : null}
                  {(meeting.blockers ?? []).some((b) => b.needs_human) ? (
                    <span className="text-amber-700">Has blockers</span>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
