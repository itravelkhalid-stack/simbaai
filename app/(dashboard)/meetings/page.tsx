import { PageHeader } from "@/components/dashboard/page-header";
import { MeetingFeedCard } from "@/components/meetings/meeting-feed-card";
import { MeetingsNav } from "@/components/meetings/meetings-nav";
import { RunMeetingForm } from "@/components/meetings/run-meeting-form";
import { Badge } from "@/components/ui/badge";
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

  const list = (meetings ?? []) as Meeting[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meetings"
        description={
          <>
            AI standups, weekly panels, board packs, and annual reviews — with
            typed actions and live KPI context ({settings.timezone}).
          </>
        }
      />
      <MeetingsNav current="/meetings" />
      <RunMeetingForm brands={brands ?? []} />

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-ink">
          Upcoming scheduled
        </h2>
        <div className="rounded-lg bg-card shadow-elevated ring-1 ring-border">
          <ul className="divide-y divide-border">
            {upcoming.length === 0 ? (
              <li className="p-5 text-sm text-ink-soft">
                No upcoming slots in the next 3 weeks. Check Meetings → Schedule.
              </li>
            ) : (
              upcoming.map((slot) => (
                <li
                  key={`${slot.brandId}-${slot.type}-${slot.dateKey}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-ink">
                      {MEETING_TYPE_LABELS[slot.type]}
                    </p>
                    <p className="text-ink-soft">
                      {brandMap.get(slot.brandId) ?? "Brand"} ·{" "}
                      {new Date(slot.at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <Badge variant="warning">scheduled</Badge>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-ink">
          Past &amp; recent
        </h2>
        {list.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No meetings yet. They schedule automatically per brand, or queue one
            above.
          </p>
        ) : (
          <div className="grid gap-3">
            {list.map((meeting) => (
              <MeetingFeedCard
                key={meeting.id}
                meeting={meeting}
                brandName={brandMap.get(meeting.brand_id) ?? "Brand"}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
