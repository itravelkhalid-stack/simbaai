import Link from "next/link";

import { MeetingsNav } from "@/components/meetings/meetings-nav";
import { RunMeetingForm } from "@/components/meetings/run-meeting-form";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import {
  MEETING_TYPE_LABELS,
  type Meeting,
} from "@/lib/types/meetings";

export default async function MeetingsFeedPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const [{ data: meetings }, { data: brands }] = await Promise.all([
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
  ]);

  const brandMap = new Map((brands ?? []).map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Meetings</h1>
        <p className="mt-2 text-muted-foreground">
          AI standups, weekly marketing panels, and board packs — readable records with
          decisions and actions.
        </p>
      </div>
      <MeetingsNav current="/meetings" />
      <RunMeetingForm brands={brands ?? []} />

      <div className="rounded-xl border">
        <div className="border-b p-3 text-sm font-medium">Meeting feed</div>
        <ul className="divide-y">
          {((meetings ?? []) as Meeting[]).length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">
              No meetings yet. They schedule automatically per brand, or queue one above.
            </li>
          ) : (
            ((meetings ?? []) as Meeting[]).map((meeting) => (
              <li key={meeting.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
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
                    {new Date(meeting.scheduled_for).toLocaleString()} · {meeting.status}
                  </p>
                </div>
                {(meeting.blockers ?? []).some((b) => b.needs_human) ? (
                  <span className="text-xs text-amber-700">Has blockers</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
