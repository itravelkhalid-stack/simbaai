import { ContentNav } from "@/components/content/content-nav";
import { PillarsManager } from "@/components/content/pillars-manager";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { ContentPillar } from "@/lib/types/content";

export default async function ContentPillarsPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_pillars")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("name");
  if (error) throw new Error(error.message);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Content pillars</h1>
        <p className="mt-2 text-muted-foreground">
          Target mix percentages guide batch planning across the calendar.
        </p>
      </div>
      <ContentNav current="/content/pillars" />
      <PillarsManager
        pillars={(data ?? []) as ContentPillar[]}
        canWrite={active.role !== "org_viewer"}
      />
    </div>
  );
}
