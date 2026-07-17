import Link from "next/link";
import { notFound } from "next/navigation";

import { ArticleEditor } from "@/components/seo/article-editor";
import { buttonVariants } from "@/components/ui/button";
import { getLatestComplianceCheck } from "@/lib/compliance/check";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { SeoArticle } from "@/lib/types/seo";
import { cn } from "@/lib/utils";

export default async function SeoArticleDetailPage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: article } = await supabase
    .from("seo_articles")
    .select("*")
    .eq("id", articleId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!article) notFound();

  const a = article as SeoArticle;
  const complianceCheck = await getLatestComplianceCheck({
    organizationId: active.organization_id,
    entityType: "seo_article",
    entityId: articleId,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/seo/projects/${a.project_id}/articles`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Back to articles
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{a.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Status: {a.status}</p>
      </div>
      <ArticleEditor
        article={a}
        complianceCheck={complianceCheck}
        canOverride={
          active.role === "org_owner" || active.role === "org_admin"
        }
      />
    </div>
  );
}
