import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";

import { SeoNav } from "@/components/seo/seo-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { SeoWeeklySummary } from "@/lib/types/seo";

export default async function SeoSummariesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("seo_projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!project) notFound();

  const { data } = await supabase
    .from("seo_weekly_summaries")
    .select("*")
    .eq("project_id", projectId)
    .order("week_start", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <SeoNav
          projectId={projectId}
          current={`/seo/projects/${projectId}/summaries`}
        />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Weekly SEO summaries
        </h1>
        <p className="mt-2 text-muted-foreground">
          Generated Mondays for the Reviews module (`seo_weekly_summaries`).
        </p>
      </div>
      <ul className="space-y-4">
        {((data ?? []) as SeoWeeklySummary[]).length === 0 ? (
          <li className="rounded-xl border p-4 text-sm text-muted-foreground">
            No summaries yet. Weekly job runs Mondays 09:00 UTC.
          </li>
        ) : (
          ((data ?? []) as SeoWeeklySummary[]).map((summary) => (
            <li key={summary.id} className="rounded-xl border p-4">
              <p className="text-sm font-medium">
                {summary.week_start} → {summary.week_end}
              </p>
              {summary.highlights?.length ? (
                <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                  {summary.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              ) : null}
              <div className="prose prose-sm mt-4 max-w-none dark:prose-invert">
                <ReactMarkdown>{summary.summary_markdown}</ReactMarkdown>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
