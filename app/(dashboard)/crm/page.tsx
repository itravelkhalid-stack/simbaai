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
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">CRM</h1>
        <p className="mt-2 text-muted-foreground">
          Contacts, pipeline, and marketing-attributed revenue — with AI scoring and
          weekly pipeline reviews.
        </p>
      </div>
      <CrmNav current="/crm" />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Contacts</p>
          <p className="text-2xl font-semibold">{contactCount ?? 0}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Open deals</p>
          <p className="text-2xl font-semibold">{openDeals ?? 0}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">CRM revenue</p>
          <p className="text-2xl font-semibold">
            £{(totalRevenue / 100).toLocaleString()}
          </p>
        </div>
      </div>

      <LifecycleFunnelChart stats={funnel} />

      {latestReview ? (
        <section className="rounded-xl border p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">
              Pipeline review · week of {latestReview.week_start}
            </h2>
            <Link href="/crm/deals" className="text-xs underline">
              Open board
            </Link>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {latestReview.summary_markdown}
            </ReactMarkdown>
          </div>
          {(latestReview.next_actions ?? []).length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {latestReview.next_actions.map((a, i) => (
                <li key={i}>{a.action}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Weekly pipeline reviews run Mondays at 07:00 UTC once you have open deals.
        </p>
      )}
    </div>
  );
}
