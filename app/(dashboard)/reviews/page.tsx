import Link from "next/link";

import { GenerateReportForm } from "@/components/reviews/generate-report-form";
import { ReviewsNav } from "@/components/reviews/reviews-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  REPORT_TYPE_LABELS,
  type Report,
} from "@/lib/types/reviews";

export default async function ReviewsFeedPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const [{ data: reports }, { data: brands }] = await Promise.all([
    supabase
      .from("reports")
      .select("*")
      .eq("organization_id", active.organization_id)
      .order("period_end", { ascending: false })
      .limit(40),
    supabase
      .from("brands")
      .select("id, name")
      .eq("organization_id", active.organization_id)
      .order("name"),
  ]);

  const brandMap = new Map((brands ?? []).map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reviews"
        description={
          <>
            Daily, weekly, monthly, and quarterly performance reports against your brand
            KPI targets.
          </>
        }
      />
      <ReviewsNav current="/reviews" />
      <GenerateReportForm brands={brands ?? []} />

      <div className="rounded-xl border">
        <div className="border-b p-3 text-sm font-medium">Report feed</div>
        <ul className="divide-y">
          {((reports ?? []) as Report[]).length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">
              No reports yet. Configure KPIs, then queue a report or wait for the
              scheduled cadence.
            </li>
          ) : (
            ((reports ?? []) as Report[]).map((report) => (
              <li
                key={report.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <div>
                  <Link
                    href={`/reviews/${report.id}`}
                    className="font-medium underline"
                  >
                    {report.title}
                  </Link>
                  <p className="text-muted-foreground">
                    {REPORT_TYPE_LABELS[report.type]} ·{" "}
                    {brandMap.get(report.brand_id) ?? "Brand"} ·{" "}
                    {report.period_start} → {report.period_end} · {report.status}
                  </p>
                </div>
                {(report.sent_to ?? []).length ? (
                  <span className="text-xs text-muted-foreground">
                    Emailed {report.sent_to.length}
                  </span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
