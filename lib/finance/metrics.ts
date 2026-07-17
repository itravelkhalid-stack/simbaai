import { createAdminClient } from "@/lib/supabase/admin";
import {
  FINANCE_CHANNELS,
  type ChannelBudgetActual,
  type FinanceBlendedMetrics,
  type FinanceChannel,
  type MonthlyPnLRow,
} from "@/lib/types/finance";

function daysInclusive(start: string, end: string) {
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function daysElapsed(start: string, end: string, asOf = new Date()) {
  const total = daysInclusive(start, end);
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T23:59:59Z`).getTime();
  const now = Math.min(asOf.getTime(), endMs);
  if (now < startMs) return 0;
  return Math.min(
    total,
    Math.max(1, Math.round((now - startMs) / 86400000) + 1),
  );
}

export async function getOrCreateFinanceSettings(
  organizationId: string,
  brandId: string,
) {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("brand_finance_settings")
    .select("*")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("brand_finance_settings")
    .insert({
      organization_id: organizationId,
      brand_id: brandId,
      cogs_pct: 0,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Settings failed");
  return data;
}

export async function getBudgetVsActual(params: {
  organizationId: string;
  brandId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<ChannelBudgetActual[]> {
  const supabase = createAdminClient();
  const [{ data: budgets }, { data: expenses }] = await Promise.all([
    supabase
      .from("budgets")
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .lte("period_start", params.periodEnd)
      .gte("period_end", params.periodStart),
    supabase
      .from("expenses")
      .select("channel, amount_pence")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .gte("expense_date", params.periodStart)
      .lte("expense_date", params.periodEnd),
  ]);

  const plannedByChannel = new Map<FinanceChannel, number>();
  let periodStart = params.periodStart;
  let periodEnd = params.periodEnd;
  for (const b of budgets ?? []) {
    plannedByChannel.set(
      b.channel,
      (plannedByChannel.get(b.channel) ?? 0) + (b.planned_pence ?? 0),
    );
    periodStart = b.period_start < periodStart ? b.period_start : periodStart;
    periodEnd = b.period_end > periodEnd ? b.period_end : periodEnd;
  }

  const actualByChannel = new Map<FinanceChannel, number>();
  for (const e of expenses ?? []) {
    actualByChannel.set(
      e.channel,
      (actualByChannel.get(e.channel) ?? 0) + (e.amount_pence ?? 0),
    );
  }

  const totalDays = daysInclusive(periodStart, periodEnd);
  const elapsed = daysElapsed(periodStart, periodEnd);
  const expectedFraction = elapsed / totalDays;

  const channels = new Set<FinanceChannel>([
    ...plannedByChannel.keys(),
    ...actualByChannel.keys(),
  ]);

  return [...channels]
    .sort()
    .map((channel) => {
      const planned = plannedByChannel.get(channel) ?? 0;
      const actual = actualByChannel.get(channel) ?? 0;
      const variance = actual - planned;
      const variance_pct =
        planned === 0 ? null : Math.round((variance / planned) * 1000) / 10;
      const expectedSpend = planned * expectedFraction;
      let pacing_pct: number | null = null;
      let pacing_label = "No budget";
      if (planned > 0 && expectedSpend > 0) {
        pacing_pct =
          Math.round(((actual - expectedSpend) / expectedSpend) * 1000) / 10;
        if (pacing_pct > 5) {
          pacing_label = `${channelLabel(channel)} is pacing ${pacing_pct}% over budget for the period`;
        } else if (pacing_pct < -5) {
          pacing_label = `${channelLabel(channel)} is pacing ${Math.abs(pacing_pct)}% under budget for the period`;
        } else {
          pacing_label = `${channelLabel(channel)} is on pace`;
        }
      } else if (actual > 0) {
        pacing_label = `${channelLabel(channel)} has spend with no budget set`;
      }
      return {
        channel,
        planned_pence: planned,
        actual_pence: actual,
        variance_pence: variance,
        variance_pct,
        pacing_pct,
        pacing_label,
      };
    });
}

function channelLabel(c: FinanceChannel) {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

export async function getBlendedMetrics(params: {
  organizationId: string;
  brandId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<FinanceBlendedMetrics> {
  const supabase = createAdminClient();
  const settings = await getOrCreateFinanceSettings(
    params.organizationId,
    params.brandId,
  );

  const [{ data: expenses }, { data: revenue }] = await Promise.all([
    supabase
      .from("expenses")
      .select("amount_pence, channel")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .gte("expense_date", params.periodStart)
      .lte("expense_date", params.periodEnd),
    supabase
      .from("revenue_records")
      .select("amount_pence, orders_count")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .gte("revenue_date", params.periodStart)
      .lte("revenue_date", params.periodEnd),
  ]);

  const total_spend_pence = (expenses ?? []).reduce(
    (s, e) => s + (e.amount_pence ?? 0),
    0,
  );
  // Marketing spend excludes platform AI costs for CAC/ROAS/MER
  const marketing_spend = (expenses ?? [])
    .filter((e) => e.channel !== "platform")
    .reduce((s, e) => s + (e.amount_pence ?? 0), 0);

  const total_revenue_pence = (revenue ?? []).reduce(
    (s, r) => s + (r.amount_pence ?? 0),
    0,
  );
  const orders_count = (revenue ?? []).reduce(
    (s, r) => s + (r.orders_count ?? 0),
    0,
  );

  const blended_roas =
    marketing_spend > 0 ? total_revenue_pence / marketing_spend : 0;
  const mer = blended_roas;
  const cac_pence =
    orders_count > 0 ? Math.round(marketing_spend / orders_count) : null;

  const cogs_pct = Number(settings.cogs_pct ?? 0);
  const cogs = Math.round(total_revenue_pence * (cogs_pct / 100));
  const gross_margin_pence = total_revenue_pence - cogs - marketing_spend;
  const gross_margin_pct =
    total_revenue_pence > 0
      ? Math.round((gross_margin_pence / total_revenue_pence) * 1000) / 10
      : null;

  return {
    total_spend_pence,
    total_revenue_pence,
    orders_count,
    blended_roas: Math.round(blended_roas * 100) / 100,
    mer: Math.round(mer * 100) / 100,
    cac_pence,
    gross_margin_pence,
    gross_margin_pct,
  };
}

export async function getMonthlyPnL(params: {
  organizationId: string;
  brandId: string;
  months?: number;
}): Promise<MonthlyPnLRow[]> {
  const months = params.months ?? 6;
  const supabase = createAdminClient();
  const settings = await getOrCreateFinanceSettings(
    params.organizationId,
    params.brandId,
  );
  const cogs_pct = Number(settings.cogs_pct ?? 0);

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - (months - 1));
  const startDate = start.toISOString().slice(0, 10);

  const [{ data: expenses }, { data: revenue }] = await Promise.all([
    supabase
      .from("expenses")
      .select("expense_date, amount_pence, channel")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .gte("expense_date", startDate),
    supabase
      .from("revenue_records")
      .select("revenue_date, amount_pence")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .gte("revenue_date", startDate),
  ]);

  const rows = new Map<string, MonthlyPnLRow>();
  for (let i = 0; i < months; i++) {
    const d = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1),
    );
    const key = d.toISOString().slice(0, 7);
    rows.set(key, {
      month: key,
      spend_pence: 0,
      revenue_pence: 0,
      cogs_pence: 0,
      gross_margin_pence: 0,
    });
  }

  for (const e of expenses ?? []) {
    if (e.channel === "platform") continue;
    const key = e.expense_date.slice(0, 7);
    const row = rows.get(key);
    if (row) row.spend_pence += e.amount_pence ?? 0;
  }
  for (const r of revenue ?? []) {
    const key = r.revenue_date.slice(0, 7);
    const row = rows.get(key);
    if (row) row.revenue_pence += r.amount_pence ?? 0;
  }

  return [...rows.values()].map((row) => {
    const cogs = Math.round(row.revenue_pence * (cogs_pct / 100));
    return {
      ...row,
      cogs_pence: cogs,
      gross_margin_pence: row.revenue_pence - cogs - row.spend_pence,
    };
  });
}

export function buildFinanceCsv(params: {
  budgetActual: ChannelBudgetActual[];
  blended: FinanceBlendedMetrics;
  pnl: MonthlyPnLRow[];
}) {
  const lines: string[] = [];
  lines.push("section,channel,planned_pence,actual_pence,variance_pct,pacing");
  for (const row of params.budgetActual) {
    lines.push(
      [
        "budget_vs_actual",
        row.channel,
        row.planned_pence,
        row.actual_pence,
        row.variance_pct ?? "",
        JSON.stringify(row.pacing_label),
      ].join(","),
    );
  }
  lines.push("");
  lines.push("metric,value");
  lines.push(`total_spend_pence,${params.blended.total_spend_pence}`);
  lines.push(`total_revenue_pence,${params.blended.total_revenue_pence}`);
  lines.push(`blended_roas,${params.blended.blended_roas}`);
  lines.push(`mer,${params.blended.mer}`);
  lines.push(`cac_pence,${params.blended.cac_pence ?? ""}`);
  lines.push(`gross_margin_pence,${params.blended.gross_margin_pence ?? ""}`);
  lines.push("");
  lines.push("month,spend_pence,revenue_pence,cogs_pence,gross_margin_pence");
  for (const row of params.pnl) {
    lines.push(
      [
        row.month,
        row.spend_pence,
        row.revenue_pence,
        row.cogs_pence,
        row.gross_margin_pence,
      ].join(","),
    );
  }
  return lines.join("\n");
}

export { FINANCE_CHANNELS };
