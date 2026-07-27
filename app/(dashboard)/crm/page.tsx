import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { CrmNav } from "@/components/crm/crm-nav";
import { LifecycleFunnelChart } from "@/components/crm/lifecycle-funnel-chart";
import { getLifecycleFunnel } from "@/lib/crm/funnel";
import { ensureDefaultPipeline } from "@/lib/crm/contacts";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { CrmPipelineReview } from "@/lib/types/crm";
import { AiContentSurface, SimbaBadge } from "@/components/brand/ai-content";
import { EmptyState } from "@/components/brand/empty-state";
import { MetricCard } from "@/components/brand/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";

export default async function CrmDashboardPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .eq("organization_id", active.organization_id)
    .order("name");

  const primaryBrand = brands?.[0];
  if (primaryBrand) {
    await ensureDefaultPipeline(active.organization_id, primaryBrand.id);
  }

  const funnel = await getLifecycleFunnel({
    organizationId: active.organization_id,
    brandId: primaryBrand?.id,
    windowDays: 30,
  });

  const [
    { count: contactCount },
    { count: openDeals },
    { data: revenueRows },
    { data: reviews },
  ] = await Promise.all([
    supabase
      .from("crm_contacts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", active.organization_id),
    supabase
      .from("crm_deals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", active.organization_id)
      .is("won_at", null)
      .is("lost_at", null),
    supabase
      .from("crm_contacts")
      .select("total_revenue_pence")
      .eq("organization_id", active.organization_id),
    supabase
      .from("crm_pipeline_reviews")
      .select("*")
      .eq("organization_id", active.organization_id)
      .order("week_start", { ascending: false })
      .limit(1),
  ]);

  const totalRevenue = (revenueRows ?? []).reduce(
    (s, r) => s + (r.total_revenue_pence ?? 0),
    0,
  );
  const latestReview = (reviews?.[0] ?? null) as CrmPipelineReview | null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM"
        description={
          <>
            Contacts, pipeline, and marketing-attributed revenue — with AI scoring and
            weekly pipeline reviews.
          </>
        }
      />
      <CrmNav current="/crm" />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Contacts" value={String(contactCount ?? 0)} />
        <MetricCard label="Open deals" value={String(openDeals ?? 0)} />
        <MetricCard
          label="CRM revenue"
          value={`£${(totalRevenue / 100).toLocaleString()}`}
        />
      </div>

      <LifecycleFunnelChart stats={funnel} />

      {latestReview ? (
        <AiContentSurface className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SimbaBadge />
              <h2 className="font-heading text-sm font-semibold text-ink">
                Pipeline review · week of {latestReview.week_start}
              </h2>
            </div>
            <Link href="/crm/deals" className="text-xs font-medium text-primary">
              Open board
            </Link>
          </div>
          <div className="prose prose-sm max-w-none prose-headings:font-heading prose-a:text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {latestReview.summary_markdown}
            </ReactMarkdown>
          </div>
          {(latestReview.next_actions ?? []).length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink">
              {latestReview.next_actions.map((a, i) => (
                <li key={i}>{a.action}</li>
              ))}
            </ul>
          ) : null}
        </AiContentSurface>
      ) : (
        <EmptyState
          title="Pipeline reviews unlock with deals"
          description="Once you have open deals, Simba runs a weekly pipeline review every Monday with next actions."
          actionLabel="View deals"
          actionHref="/crm/deals"
          className="py-10"
        />
      )}
    </div>
  );
}
