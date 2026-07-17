import { ContentNav } from "@/components/content/content-nav";
import { ReviewQueueTable } from "@/components/content/review-queue-table";
import { ResearchRunProgress } from "@/components/research/run-progress";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { AgentRun } from "@/lib/types/database";
import type { ContentItem } from "@/lib/types/content";

export default async function ContentQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const params = await searchParams;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data: items, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("organization_id", active.organization_id)
    .in("status", ["pending_approval", "rejected", "draft"])
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  let run: AgentRun | null = null;
  if (params.run) {
    const { data } = await supabase
      .from("agent_runs")
      .select("*")
      .eq("id", params.run)
      .eq("organization_id", active.organization_id)
      .maybeSingle();
    run = data;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Review queue</h1>
        <p className="mt-2 text-muted-foreground">
          Approve, edit inline, comment, or reject with reasons for regeneration.
        </p>
      </div>
      <ContentNav current="/content/queue" />
      {run ? <ResearchRunProgress runId={run.id} initialRun={run} /> : null}
      <ReviewQueueTable items={(items ?? []) as ContentItem[]} />
    </div>
  );
}
