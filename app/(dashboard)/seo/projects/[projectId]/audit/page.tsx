import { notFound } from "next/navigation";

import { SeoNav } from "@/components/seo/seo-nav";
import { runAuditNow } from "@/lib/seo/actions";
import { Button } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { SeoPage, SeoPageIssue } from "@/lib/types/seo";

export default async function SeoAuditPage({
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

  const { data: pages } = await supabase
    .from("seo_pages")
    .select("*")
    .eq("project_id", projectId)
    .order("status")
    .order("url");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SeoNav projectId={projectId} current={`/seo/projects/${projectId}/audit`} />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            Technical audit
          </h1>
          <p className="mt-2 text-muted-foreground">
            Crawl respects robots.txt and page caps. Issues are prioritised per page.
          </p>
        </div>
        <form action={runAuditNow}>
          <input type="hidden" name="projectId" value={projectId} />
          <Button type="submit">Run audit</Button>
        </form>
      </div>

      <ul className="space-y-3">
        {((pages ?? []) as SeoPage[]).length === 0 ? (
          <li className="rounded-xl border p-4 text-sm text-muted-foreground">
            No audited pages yet.
          </li>
        ) : (
          ((pages ?? []) as SeoPage[]).map((page) => (
            <li key={page.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-medium break-all">{page.url}</p>
                  <p className="text-sm text-muted-foreground">
                    {page.status}
                    {page.pagespeed_score != null
                      ? ` · PSI ${page.pagespeed_score}`
                      : ""}
                    {page.word_count != null ? ` · ${page.word_count} words` : ""}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-sm">{page.title || "No title"}</p>
              <ul className="mt-3 space-y-1 text-sm">
                {((page.issues ?? []) as SeoPageIssue[]).map((issue, idx) => (
                  <li key={`${issue.code}-${idx}`} className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      [{issue.severity}]
                    </span>{" "}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
