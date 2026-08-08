import "server-only";

import {
  currentYearMonth,
  type AdBudgetAllocationMode,
  type PlatformAllocationRow,
  platformAllocationsSchema,
} from "@/lib/ads/budget-allocation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BrandBudgetMonth } from "@/lib/types/ads";

export type ResolvedMonthBudget = {
  yearMonth: string;
  budgetPence: number | null;
  currency: string;
  source: "schedule" | "default" | "none";
  allocationMode: AdBudgetAllocationMode;
  platformAllocations: PlatformAllocationRow[];
  scheduleRow: BrandBudgetMonth | null;
};

export async function resolveMonthBudget(params: {
  organizationId: string;
  brandId: string;
  yearMonth?: string;
  /** Prefer admin for agents/jobs; use createClient caller when omitted. */
  admin?: boolean;
  supabase?: Awaited<
    ReturnType<typeof import("@/lib/supabase/server").createClient>
  >;
}): Promise<ResolvedMonthBudget> {
  const yearMonth = params.yearMonth ?? currentYearMonth();
  const supabase =
    params.supabase ??
    (params.admin !== false
      ? createAdminClient()
      : await (await import("@/lib/supabase/server")).createClient());

  const [{ data: schedule }, { data: brand }] = await Promise.all([
    supabase
      .from("brand_budget_months")
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .eq("year_month", yearMonth)
      .maybeSingle(),
    supabase
      .from("brands")
      .select(
        "monthly_ad_budget_pence, monthly_ad_budget_currency, ad_budget_allocation_mode, ad_budget_platform_allocations",
      )
      .eq("id", params.brandId)
      .eq("organization_id", params.organizationId)
      .single(),
  ]);

  const brandDefaultMode =
    ((brand as { ad_budget_allocation_mode?: AdBudgetAllocationMode } | null)
      ?.ad_budget_allocation_mode as AdBudgetAllocationMode | undefined) ??
    "ai_allocates";
  const brandDefaultAlloc = platformAllocationsSchema.parse(
    (brand as { ad_budget_platform_allocations?: unknown } | null)
      ?.ad_budget_platform_allocations ?? [],
  );
  const currency =
    (brand as { monthly_ad_budget_currency?: string } | null)
      ?.monthly_ad_budget_currency ?? "GBP";

  if (schedule) {
    const row = schedule as BrandBudgetMonth;
    return {
      yearMonth,
      budgetPence: row.budget_pence,
      currency: row.currency || currency,
      source: "schedule",
      allocationMode: row.allocation_mode,
      platformAllocations: platformAllocationsSchema.parse(
        row.platform_allocations ?? [],
      ),
      scheduleRow: row,
    };
  }

  const fallback =
    (brand as { monthly_ad_budget_pence?: number | null } | null)
      ?.monthly_ad_budget_pence ?? null;
  if (fallback != null && fallback >= 0) {
    return {
      yearMonth,
      budgetPence: fallback,
      currency,
      source: "default",
      allocationMode: brandDefaultMode,
      platformAllocations: brandDefaultAlloc,
      scheduleRow: null,
    };
  }

  return {
    yearMonth,
    budgetPence: null,
    currency,
    source: "none",
    allocationMode: brandDefaultMode,
    platformAllocations: brandDefaultAlloc,
    scheduleRow: null,
  };
}

/** Next N months of resolved pots (schedule entry preferred). */
export async function resolveForwardBudgetSchedule(params: {
  organizationId: string;
  brandId: string;
  fromYearMonth?: string;
  months?: number;
}) {
  const { addMonthsToYearMonth } = await import("@/lib/ads/budget-allocation");
  const start = params.fromYearMonth ?? currentYearMonth();
  const count = params.months ?? 3;
  const out: ResolvedMonthBudget[] = [];
  for (let i = 0; i < count; i++) {
    out.push(
      await resolveMonthBudget({
        organizationId: params.organizationId,
        brandId: params.brandId,
        yearMonth: addMonthsToYearMonth(start, i),
        admin: true,
      }),
    );
  }
  return out;
}
