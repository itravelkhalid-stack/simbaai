import Image from "next/image";
import Link from "next/link";

import { ReportCharts } from "@/components/reviews/report-charts";
import { ReportExportActions } from "@/components/reviews/report-export-actions";
import { ReviewsNav } from "@/components/reviews/reviews-nav";
import { getOrCreateBrandReportSettings } from "@/lib/reviews/periods";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import {
  REPORT_TYPE_LABELS,
  type Report,
  type ReportContent,
} from "@/lib/types/reviews";

function deltaLabel(pct: number | null) {
  if (pct == null) return "n/a";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data: report } = await supabase
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .eq("organization_id", active.organization_id)
    .single();

  if (!report) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Report not found.</p>
        <Link href="/reviews" className="underline">
          Back
        </Link>
      </div>
    );
  }

  const r = report as Report;
  const content = (r.content ?? {}) as ReportContent;
  const settings = await getOrCreateBrandReportSettings(
    active.organization_id,
    r.brand_id,
  );
  const primary = content.branding?.primary_color ?? settings.primary_color;
  const logo = content.branding?.logo_url ?? settings.logo_url;

  return (
    <div className="space-y-6">
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: `${primary}55` }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/reviews" className="text-sm text-muted-foreground underline">
              ← Reports
            </Link>
            <div className="mt-3 flex items-center gap-3">
              {logo ? (
                <Image
                  src={logo}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded object-contain"
                />
              ) : null}
              <div>
                <h1 className="text-3xl font-semibold tracking-tight" style={{ color: primary }}>
                  {r.title}
                </h1>
                <p className="mt-1 text-muted-foreground">
                  {content.branding?.brand_name ?? "Brand"} ·{" "}
                  {REPORT_TYPE_LABELS[r.type]} · {r.period_start} → {r.period_end} ·{" "}
                  {r.status}
                </p>
              </div>
            </div>
          </div>
        </div>
        {content.summary ? (
          <p className="mt-4 max-w-3xl text-sm leading-relaxed">{content.summary}</p>
        ) : null}
      </div>

      <ReviewsNav current="/reviews" />

      {r.error ? (
        <div className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
          {r.error}
        </div>
      ) : null}

      {r.status === "complete" ? (
        <>
          <ReportExportActions
            report={r}
            content={content}
            defaultRecipients={settings.recipients ?? []}
          />

          <section>
            <h2 className="mb-3 text-sm font-medium">Headline numbers</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(content.headline_numbers ?? []).map((h, i) => (
                <div key={i} className="rounded-xl border p-4">
                  <p className="text-xs text-muted-foreground">{h.label}</p>
                  <p className="mt-1 text-2xl font-semibold" style={{ color: primary }}>
                    {h.unit === "£" ? "£" : ""}
                    {h.value}
                    {h.unit && h.unit !== "£" ? ` ${h.unit}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    vs prior {h.previous}
                    {h.unit === "£" ? "" : h.unit ? ` ${h.unit}` : ""} · Δ{" "}
                    <span
                      className={
                        (h.delta_pct ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"
                      }
                    >
                      {deltaLabel(h.delta_pct)}
                    </span>
                    {h.target != null ? ` · target ${h.target}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <ReportCharts content={content} />

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border p-4">
              <h2 className="mb-3 text-sm font-medium">Channel breakdown</h2>
              <ul className="space-y-3 text-sm">
                {(content.channels ?? []).map((ch, i) => (
                  <li key={i}>
                    <p className="font-medium">{ch.channel}</p>
                    <p className="text-muted-foreground">{ch.commentary}</p>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-xl border p-4">
              <h2 className="mb-3 text-sm font-medium">Campaign vs KPI</h2>
              {(content.campaigns ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No campaigns in this period.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {content.campaigns.map((c, i) => (
                    <li key={i}>
                      <p className="font-medium">
                        {c.name}{" "}
                        <span className="text-muted-foreground">[{c.status}]</span>
                      </p>
                      <p className="text-muted-foreground">{c.commentary}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border p-4">
              <h2 className="mb-3 text-sm font-medium">Insights</h2>
              <ul className="list-disc space-y-2 pl-5 text-sm">
                {(content.insights ?? []).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
            <section className="rounded-xl border p-4">
              <h2 className="mb-3 text-sm font-medium">Recommendations</h2>
              <ul className="list-disc space-y-2 pl-5 text-sm">
                {(content.recommendations ?? []).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          </div>

          {content.plan_retrospective ? (
            <section className="rounded-xl border p-4">
              <h2 className="mb-3 text-sm font-medium">Plan retrospective</h2>
              <div className="grid gap-4 text-sm md:grid-cols-3">
                <div>
                  <p className="mb-1 font-medium">What worked</p>
                  <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                    {content.plan_retrospective.what_worked.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-medium">What missed</p>
                  <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                    {content.plan_retrospective.what_missed.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 font-medium">Lessons</p>
                  <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                    {content.plan_retrospective.lessons.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          ) : null}

          {(content.next_quarter_proposals ?? []).length ? (
            <section className="rounded-xl border p-4">
              <h2 className="mb-3 text-sm font-medium">Next quarter proposals</h2>
              <ul className="list-disc space-y-2 pl-5 text-sm">
                {content.next_quarter_proposals!.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Report is {r.status}. Refresh shortly after the background job completes.
        </p>
      )}
    </div>
  );
}
