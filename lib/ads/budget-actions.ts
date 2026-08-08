"use server";

import { revalidatePath } from "next/cache";

import {
  brandBudgetDefaultSchema,
  brandBudgetMonthUpsertSchema,
  platformAllocationsSchema,
} from "@/lib/ads/budget-allocation";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";

async function assertCanManageBudgets() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot edit ad budgets");
  }
  return ctx;
}

export type BudgetActionResult = {
  error?: string;
  success?: string;
};

export async function upsertBrandBudgetMonth(
  _prev: BudgetActionResult,
  formData: FormData,
): Promise<BudgetActionResult> {
  try {
    const { active } = await assertCanManageBudgets();
    const allocationsRaw = String(formData.get("platformAllocationsJson") ?? "[]");
    let allocationsUnknown: unknown = [];
    try {
      allocationsUnknown = JSON.parse(allocationsRaw);
    } catch {
      return { error: "Invalid platform allocations JSON" };
    }
    const allocParsed = platformAllocationsSchema.safeParse(allocationsUnknown);
    if (!allocParsed.success) {
      return { error: allocParsed.error.issues[0]?.message ?? "Invalid allocations" };
    }

    const parsed = brandBudgetMonthUpsertSchema.safeParse({
      brandId: formData.get("brandId"),
      yearMonth: formData.get("yearMonth"),
      budgetMajor: formData.get("budgetMajor"),
      currency: formData.get("currency") || "GBP",
      allocationMode: formData.get("allocationMode") || "ai_allocates",
      platformAllocations: allocParsed.data,
      notes: formData.get("notes") || null,
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid budget" };
    }

    const supabase = await createClient();
    const { data: brand } = await supabase
      .from("brands")
      .select("id")
      .eq("id", parsed.data.brandId)
      .eq("organization_id", active.organization_id)
      .maybeSingle();
    if (!brand) return { error: "Brand not found" };

    const budgetPence = Math.round(parsed.data.budgetMajor * 100);
    const { error } = await supabase.from("brand_budget_months").upsert(
      {
        organization_id: active.organization_id,
        brand_id: parsed.data.brandId,
        year_month: parsed.data.yearMonth,
        budget_pence: budgetPence,
        currency: parsed.data.currency.toUpperCase(),
        allocation_mode: parsed.data.allocationMode,
        platform_allocations: parsed.data.platformAllocations,
        notes: parsed.data.notes || null,
      },
      { onConflict: "brand_id,year_month" },
    );
    if (error) return { error: error.message };

    revalidatePath("/ads/budgets");
    revalidatePath("/ads");
    revalidatePath("/finance");
    return { success: `Saved ${parsed.data.yearMonth} pot` };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to save month budget",
    };
  }
}

export async function deleteBrandBudgetMonth(
  _prev: BudgetActionResult,
  formData: FormData,
): Promise<BudgetActionResult> {
  try {
    const { active } = await assertCanManageBudgets();
    const brandId = String(formData.get("brandId") ?? "");
    const yearMonth = String(formData.get("yearMonth") ?? "");
    if (!brandId || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return { error: "Brand and year-month required" };
    }
    const supabase = await createClient();
    const { error } = await supabase
      .from("brand_budget_months")
      .delete()
      .eq("organization_id", active.organization_id)
      .eq("brand_id", brandId)
      .eq("year_month", yearMonth);
    if (error) return { error: error.message };
    revalidatePath("/ads/budgets");
    return { success: `Removed ${yearMonth} schedule entry (default applies)` };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to delete month budget",
    };
  }
}

export async function saveBrandBudgetDefaults(
  _prev: BudgetActionResult,
  formData: FormData,
): Promise<BudgetActionResult> {
  try {
    const { active } = await assertCanManageBudgets();
    const allocationsRaw = String(formData.get("platformAllocationsJson") ?? "[]");
    let allocationsUnknown: unknown = [];
    try {
      allocationsUnknown = JSON.parse(allocationsRaw);
    } catch {
      return { error: "Invalid platform allocations JSON" };
    }
    const allocParsed = platformAllocationsSchema.safeParse(allocationsUnknown);
    if (!allocParsed.success) {
      return { error: allocParsed.error.issues[0]?.message ?? "Invalid allocations" };
    }

    const parsed = brandBudgetDefaultSchema.safeParse({
      brandId: formData.get("brandId"),
      defaultBudgetMajor: formData.get("defaultBudgetMajor") || null,
      currency: formData.get("currency") || "GBP",
      allocationMode: formData.get("allocationMode") || "ai_allocates",
      platformAllocations: allocParsed.data,
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid defaults" };
    }

    const monthlyPence =
      parsed.data.defaultBudgetMajor != null &&
      parsed.data.defaultBudgetMajor > 0
        ? Math.round(parsed.data.defaultBudgetMajor * 100)
        : null;

    const supabase = await createClient();
    const { error } = await supabase
      .from("brands")
      .update({
        monthly_ad_budget_pence: monthlyPence,
        monthly_ad_budget_currency: parsed.data.currency.toUpperCase(),
        ad_budget_allocation_mode: parsed.data.allocationMode,
        ad_budget_platform_allocations: parsed.data.platformAllocations,
      })
      .eq("id", parsed.data.brandId)
      .eq("organization_id", active.organization_id);
    if (error) return { error: error.message };

    revalidatePath("/ads/budgets");
    revalidatePath("/brand/autonomy");
    return { success: "Saved default monthly pot and allocation mode" };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to save defaults",
    };
  }
}
