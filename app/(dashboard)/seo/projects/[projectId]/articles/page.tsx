import Link from "next/link";
import { notFound } from "next/navigation";

import { SeoNav } from "@/components/seo/seo-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { SeoArticle } from "@/lib/types/seo";

export default async function SeoArticlesPage({
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
    .from("seo_articles")
    .select("*")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <SeoNav projectId={projectId} current={`/seo/projects/${projectId}/articles`} />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Articles</h1>
      </div>
      <ul className="divide-y rounded-xl border">
        {((data ?? []) as SeoArticle[]).length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">No articles yet.</li>
        ) : (
          ((data ?? []) as SeoArticle[]).map((article) => (
            <li key={article.id} className="flex justify-between gap-3 p-4">
              <div>
                <Link
                  href={`/seo/articles/${article.id}`}
                  className="font-medium underline"
                >
                  {article.title}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {article.status}
                  {article.checklist_score != null
                    ? ` · checklist ${article.checklist_score}/100`
                    : ""}
                </p>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
