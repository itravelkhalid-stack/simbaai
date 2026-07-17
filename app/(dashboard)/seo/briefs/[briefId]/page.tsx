import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";

import { draftArticleFromBrief } from "@/lib/seo/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { SeoContentBrief, SeoKeyword } from "@/lib/types/seo";
import { cn } from "@/lib/utils";

export default async function SeoBriefDetailPage({
  params,
}: {
  params: Promise<{ briefId: string }>;
}) {
  const { briefId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: brief } = await supabase
    .from("seo_content_briefs")
    .select("*")
    .eq("id", briefId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!brief) notFound();

  const b = brief as SeoContentBrief;
  const { data: keyword } = await supabase
    .from("seo_keywords")
    .select("*")
    .eq("id", b.keyword_id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href={`/seo/projects/${b.project_id}/briefs`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Back to briefs
          </Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">{b.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Keyword: {(keyword as SeoKeyword | null)?.keyword ?? b.keyword_id} ·{" "}
            {b.search_intent} · {b.target_word_count} words
          </p>
        </div>
        <form action={draftArticleFromBrief}>
          <input type="hidden" name="briefId" value={b.id} />
          <Button type="submit">Draft article with AI</Button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-4">
          <p className="mb-2 text-sm font-medium">Outline</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {(b.outline ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
        <div className="rounded-xl border p-4">
          <p className="mb-2 text-sm font-medium">Entities</p>
          <p className="text-sm">{(b.entities ?? []).join(" · ") || "—"}</p>
          <p className="mt-3 mb-2 text-sm font-medium">Internal links</p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {(b.internal_links ?? []).map((l) => (
              <li key={l} className="break-all">
                {l}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="prose prose-sm max-w-none rounded-xl border p-4 dark:prose-invert">
        <ReactMarkdown>{b.brief_markdown}</ReactMarkdown>
      </div>
    </div>
  );
}
