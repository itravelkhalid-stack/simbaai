import { notFound } from "next/navigation";

import { KeywordMapEditor } from "@/components/seo/keyword-map-editor";
import { SeoNav } from "@/components/seo/seo-nav";
import { createBriefForKeyword } from "@/lib/seo/actions";
import { Button } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { SeoKeyword, SeoKeywordMap, SeoProject } from "@/lib/types/seo";

export default async function SeoKeywordsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("seo_projects")
    .select("*")
    .eq("id", projectId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!project) notFound();

  const { data: keywords } = await supabase
    .from("seo_keywords")
    .select("*")
    .eq("project_id", projectId)
    .order("keyword");

  return (
    <div className="space-y-6">
      <div>
        <SeoNav projectId={projectId} current={`/seo/projects/${projectId}/keywords`} />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Keywords</h1>
        <p className="mt-2 text-muted-foreground">
          Pillar/cluster map with intent and priority. Generate briefs from tracked
          keywords.
        </p>
      </div>

      <KeywordMapEditor
        projectId={projectId}
        map={((project as SeoProject).keyword_map ?? { pillars: [] }) as SeoKeywordMap}
      />

      <div className="rounded-xl border">
        <div className="border-b p-3 text-sm font-medium">Tracked keywords</div>
        <ul className="divide-y">
          {((keywords ?? []) as SeoKeyword[]).map((kw) => (
            <li
              key={kw.id}
              className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
            >
              <div>
                <p className="font-medium">{kw.keyword}</p>
                <p className="text-muted-foreground">
                  {kw.intent} · {kw.priority}
                  {kw.pillar ? ` · ${kw.pillar}` : ""}
                  {kw.current_position != null
                    ? ` · pos ${kw.current_position}`
                    : ""}
                </p>
              </div>
              <form action={createBriefForKeyword}>
                <input type="hidden" name="keywordId" value={kw.id} />
                <Button type="submit" size="sm" variant="outline">
                  Create brief
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
