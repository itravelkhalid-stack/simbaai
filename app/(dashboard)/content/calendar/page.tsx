import { ContentCalendar } from "@/components/content/content-calendar";
import { ContentNav } from "@/components/content/content-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { ContentItem } from "@/lib/types/content";

export default async function ContentCalendarPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("organization_id", active.organization_id)
    .not("scheduled_at", "is", null)
    .in("status", ["scheduled", "published", "publish_failed", "approved"])
    .order("scheduled_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Content calendar</h1>
        <p className="mt-2 text-muted-foreground">
          Week/month view · drag to reschedule · colour-coded by platform and status.
        </p>
      </div>
      <ContentNav current="/content/calendar" />
      <ContentCalendar
        items={(data ?? []) as ContentItem[]}
        canWrite={active.role !== "org_viewer"}
      />
    </div>
  );
}
