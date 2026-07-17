import Link from "next/link";
import { notFound } from "next/navigation";

import { SeoNav } from "@/components/seo/seo-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { SeoContentBrief } from "@/lib/types/seo";

export default async function SeoBriefsPage({
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
    .from("seo_content_briefs")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <SeoNav projectId={projectId} current={`/seo/projects/${projectId}/briefs`} />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Content briefs</h1>
      </div>
      <ul className="divide-y rounded-xl border">
        {((data ?? []) as SeoContentBrief[]).length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">
            No briefs — create one from Keywords.
          </li>
        ) : (
          ((data ?? []) as SeoContentBrief[]).map((brief) => (
            <li key={brief.id} className="p-4">
              <Link href={`/seo/briefs/${brief.id}`} className="font-medium underline">
                {brief.title}
              </Link>
              <p className="text-sm text-muted-foreground">
                {brief.status} · {brief.target_word_count} words ·{" "}
                {brief.search_intent}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
