import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { FinanceEntryForms } from "@/components/finance/entry-forms";
import {
  BudgetActualChart,
  MonthlyPnLChart,
} from "@/components/finance/finance-charts";
import { FinanceNav } from "@/components/finance/finance-nav";
import {
  buildFinanceCsv,
  getBlendedMetrics,
  getBudgetVsActual,
  getMonthlyPnL,
} from "@/lib/finance/metrics";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import {
  FINANCE_CHANNEL_LABELS,
  type FinanceWeeklySummary,
} from "@/lib/types/finance";

function monthBounds(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default async function FinanceDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string }>;
}) {
  const { active } = await requireActiveOrg();
  const params = await searchParams;
  const supabase = await createClient();
  const month = monthBounds();

  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .eq("organization_id", active.organization_id)
    .order("name");

  const brandId = params.brandId || brands?.[0]?.id;

  if (!brandId) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Finance</h1>
        <p className="text-sm text-muted-foreground">Create a brand first.</p>
      </div>
    );
  }

  const [budgetActual, blended, pnl, { data: summaries }] = await Promise.all([
    getBudgetVsActual({
      organizationId: active.organization_id,
      brandId,
      periodStart: month.start,
      periodEnd: month.end,
    }),
    getBlendedMetrics({
      organizationId: active.organization_id,
      brandId,
      periodStart: month.start,
      periodEnd: month.end,
    }),
    getMonthlyPnL({
      organizationId: active.organization_id,
      brandId,
      months: 6,
    }),
    supabase
      .from("finance_weekly_summaries")
      .select("*")
      .eq("organization_id", active.organization_id)
      .eq("brand_id", brandId)
      .order("week_start", { ascending: false })
      .limit(1),
  ]);

  const csv = buildFinanceCsv({ budgetActual, blended, pnl });
  const latest = (summaries?.[0] ?? null) as FinanceWeeklySummary | null;
  const pacingAlerts = budgetActual.filter(
    (r) => r.pacing_pct != null && Math.abs(r.pacing_pct) > 5,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Finance</h1>
        <p className="mt-2 text-muted-foreground">
          Marketing budgets, spend, attributed revenue, and platform billing.
        </p>
      </div>
      <FinanceNav current="/finance" />

      <div className="flex flex-wrap gap-2">
        {(brands ?? []).map((b) => (
          <a
            key={b.id}
            href={`/finance?brandId=${b.id}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              b.id === brandId ? "bg-foreground text-background" : ""
            }`}
          >
            {b.name}
          </a>
        ))}
        <a
          href={`/api/finance/export?brandId=${brandId}`}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          Export CSV
        </a>
        <Link href="/finance/billing" className="rounded-md border px-3 py-1.5 text-sm">
          Platform billing
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Spend (period)"
          value={`£${(blended.total_spend_pence / 100).toLocaleString()}`}
        />
        <Metric
          label="Revenue"
          value={`£${(blended.total_revenue_pence / 100).toLocaleString()}`}
        />
        <Metric label="Blended ROAS / MER" value={`${blended.blended_roas}x`} />
        <Metric
          label="CAC"
          value={
            blended.cac_pence != null
              ? `£${(blended.cac_pence / 100).toFixed(2)}`
              : "—"
          }
        />
      </div>

      {pacingAlerts.length ? (
        <div className="rounded-xl border border-amber-500/30 p-4">
          <p className="mb-2 text-sm font-medium">Burn-rate pacing</p>
          <ul className="space-y-1 text-sm">
            {pacingAlerts.map((a) => (
              <li key={a.channel}>{a.pacing_label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <BudgetActualChart rows={budgetActual} />
        <MonthlyPnLChart rows={pnl} />
      </div>

      <section className="rounded-xl border p-4">
        <h2 className="mb-3 text-sm font-medium">Channel detail</h2>
        <ul className="divide-y text-sm">
          {budgetActual.length === 0 ? (
            <li className="py-2 text-muted-foreground">No channels yet.</li>
          ) : (
            budgetActual.map((row) => (
              <li
                key={row.channel}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>{FINANCE_CHANNEL_LABELS[row.channel]}</span>
                <span className="text-muted-foreground">
                  £{(row.actual_pence / 100).toFixed(0)} / £
                  {(row.planned_pence / 100).toFixed(0)}
                  {row.variance_pct != null
                    ? ` · Δ ${row.variance_pct > 0 ? "+" : ""}${row.variance_pct}%`
                    : ""}
                </span>
              </li>
            ))
          )}
        </ul>
        {blended.gross_margin_pence != null ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Gross margin (after COGS + marketing spend): £
            {(blended.gross_margin_pence / 100).toLocaleString()}
            {blended.gross_margin_pct != null
              ? ` (${blended.gross_margin_pct}%)`
              : ""}
          </p>
        ) : null}
      </section>

      {latest ? (
        <section className="rounded-xl border p-4">
          <h2 className="mb-2 text-sm font-medium">
            AI Finance analyst · week of {latest.week_start}
          </h2>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {latest.summary_markdown}
            </ReactMarkdown>
          </div>
          {(latest.alerts ?? []).length ? (
            <ul className="mt-3 space-y-1 text-sm">
              {latest.alerts.map((a, i) => (
                <li key={i}>
                  <span className="font-medium uppercase">{a.severity}</span>:{" "}
                  {a.message}
                </li>
              ))}
            </ul>
          ) : null}
          {(latest.reallocation_suggestions ?? []).length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Reallocation suggestions were pushed to{" "}
              <Link href="/ads/recommendations" className="underline">
                Ads recommendations
              </Link>
              .
            </p>
          ) : null}
        </section>
      ) : null}

      <FinanceEntryForms brands={brands ?? []} />

      {/* Keep csv string referenced so buildFinanceCsv stays exercised server-side */}
      <span className="hidden">{csv.length}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
