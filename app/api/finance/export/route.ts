import { NextResponse } from "next/server";

import {
  buildFinanceCsv,
  getBlendedMetrics,
  getBudgetVsActual,
  getMonthlyPnL,
} from "@/lib/finance/metrics";
import { requireActiveOrg } from "@/lib/org/require";

function monthBounds(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function GET(req: Request) {
  const { active } = await requireActiveOrg();
  const url = new URL(req.url);
  const brandId = url.searchParams.get("brandId");
  if (!brandId) {
    return NextResponse.json({ error: "brandId required" }, { status: 400 });
  }

  const month = monthBounds();
  const [budgetActual, blended, pnl] = await Promise.all([
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
  ]);

  const csv = buildFinanceCsv({ budgetActual, blended, pnl });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finance-${brandId}-${month.start}.csv"`,
    },
  });
}
