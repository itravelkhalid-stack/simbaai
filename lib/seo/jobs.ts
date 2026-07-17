import { createAdminClient } from "@/lib/supabase/admin";
import { crawlAndAuditSite } from "@/lib/seo/audit";
import { syncGscDailyForProject } from "@/lib/seo/gsc";
import {
  generateWeeklySeoSummary,
} from "@/lib/agents/seo/generate";
import { getBrandContext } from "@/lib/brand/context";
import type { SeoKeyword, SeoPage, SeoProject } from "@/lib/types/seo";

export async function runTechnicalAudit(projectId: string) {
  const supabase = createAdminClient();
  const { data: project } = await supabase
    .from("seo_projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (!project) throw new Error("SEO project not found");

  const p = project as SeoProject;
  const pages = await crawlAndAuditSite({
    domain: p.domain,
    pageCap: Number(process.env.SEO_AUDIT_PAGE_CAP ?? 40),
  });

  for (const page of pages) {
    await supabase.from("seo_pages").upsert(
      {
        organization_id: p.organization_id,
        project_id: p.id,
        url: page.url,
        title: page.title,
        meta_description: page.meta_description,
        h1: page.h1,
        status: page.status,
        issues: page.issues,
        word_count: page.word_count,
        has_schema: page.has_schema,
        missing_alt_count: page.missing_alt_count,
        broken_link_count: page.broken_link_count,
        pagespeed_score: page.pagespeed_score,
        pagespeed_raw: page.pagespeed_raw,
        last_audited_at: new Date().toISOString(),
      },
      { onConflict: "project_id,url" },
    );
  }

  await supabase
    .from("seo_projects")
    .update({ last_audit_at: new Date().toISOString() })
    .eq("id", p.id);

  return { pages: pages.length };
}

export async function syncAllGscProjects() {
  const supabase = createAdminClient();
  const { data: projects } = await supabase
    .from("seo_projects")
    .select("*")
    .eq("gsc_connected", true)
    .limit(50);

  const results = [];
  for (const project of (projects ?? []) as SeoProject[]) {
    try {
      const result = await syncGscDailyForProject(project, 7);
      results.push({ id: project.id, ok: true, ...result });
    } catch (error) {
      results.push({
        id: project.id,
        ok: false,
        error: error instanceof Error ? error.message : "sync failed",
      });
    }
  }
  return results;
}

export async function generateWeeklySummariesForAll() {
  const supabase = createAdminClient();
  const { data: projects } = await supabase
    .from("seo_projects")
    .select("*")
    .limit(50);

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const weekStart = start.toISOString().slice(0, 10);
  const weekEnd = end.toISOString().slice(0, 10);

  const results = [];
  for (const project of (projects ?? []) as SeoProject[]) {
    try {
      const brandContext = await getBrandContext(
        project.organization_id,
        project.brand_id,
        { admin: true },
      );

      const [{ data: keywords }, { data: pages }, { data: gsc }] =
        await Promise.all([
          supabase
            .from("seo_keywords")
            .select("*")
            .eq("project_id", project.id)
            .eq("tracked", true)
            .limit(50),
          supabase
            .from("seo_pages")
            .select("*")
            .eq("project_id", project.id)
            .order("updated_at", { ascending: false })
            .limit(30),
          supabase
            .from("seo_gsc_daily")
            .select("clicks, impressions, query, position")
            .eq("project_id", project.id)
            .gte("metric_date", weekStart)
            .limit(200),
        ]);

      const movers = ((keywords ?? []) as SeoKeyword[])
        .filter((k) => k.current_position != null && k.previous_position != null)
        .map((k) => ({
          keyword: k.keyword,
          delta: Number(k.previous_position) - Number(k.current_position),
          position: k.current_position,
        }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 15);

      const criticalPages = ((pages ?? []) as SeoPage[]).filter(
        (p) => p.status === "critical" || p.status === "needs_work",
      );

      const clicks = (gsc ?? []).reduce((s, r) => s + (r.clicks ?? 0), 0);
      const impressions = (gsc ?? []).reduce(
        (s, r) => s + (r.impressions ?? 0),
        0,
      );

      const performanceMarkdown = `
Clicks: ${clicks}
Impressions: ${impressions}
Tracked keywords: ${(keywords ?? []).length}
Top movers:
${movers.map((m) => `- ${m.keyword}: ${m.delta > 0 ? "+" : ""}${m.delta.toFixed(1)} → pos ${m.position}`).join("\n") || "- none"}
Technical issues pages: ${criticalPages.length}
${criticalPages
  .slice(0, 10)
  .map((p) => `- ${p.url}: ${p.status} (${(p.issues ?? []).length} issues)`)
  .join("\n")}
`.trim();

      const { data: run } = await supabase
        .from("agent_runs")
        .insert({
          organization_id: project.organization_id,
          module: "seo",
          agent_name: "seo_weekly_summary",
          status: "running",
          input: { projectId: project.id, weekStart, weekEnd },
          logs: [{ at: new Date().toISOString(), message: "Generating weekly summary" }],
          progress: 10,
        })
        .select("id")
        .single();

      const generated = await generateWeeklySeoSummary({
        brandContext,
        domain: project.domain,
        performanceMarkdown,
      });

      if (run) {
        await supabase
          .from("agent_runs")
          .update({
            status: "complete",
            output: generated.data,
            model: generated.model,
            tokens_in: generated.tokensIn,
            tokens_out: generated.tokensOut,
            cost_pence: generated.costPence,
            progress: 100,
          })
          .eq("id", run.id);
      }

      await supabase.from("seo_weekly_summaries").upsert(
        {
          organization_id: project.organization_id,
          project_id: project.id,
          week_start: weekStart,
          week_end: weekEnd,
          summary_markdown: generated.data.summary_markdown,
          highlights: generated.data.highlights,
          metrics: { clicks, impressions, movers, critical_pages: criticalPages.length },
          agent_run_id: run?.id ?? null,
        },
        { onConflict: "project_id,week_start" },
      );

      results.push({ id: project.id, ok: true });
    } catch (error) {
      results.push({
        id: project.id,
        ok: false,
        error: error instanceof Error ? error.message : "failed",
      });
    }
  }
  return results;
}
