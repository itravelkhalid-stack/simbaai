import "server-only";

import { reviewContentItemAsCmo, type CmoReviewResult } from "@/lib/cmo/approve";
import { isCmoEnabledForBrand } from "@/lib/cmo/settings";
import { createAdminClient } from "@/lib/supabase/admin";

export async function queueCmoReviewForItems(params: {
  organizationId: string;
  brandId: string;
  itemIds: string[];
}): Promise<void> {
  if (!params.itemIds.length) return;
  const enabled = await isCmoEnabledForBrand({
    organizationId: params.organizationId,
    brandId: params.brandId,
  });
  if (!enabled) return;

  try {
    const { inngest } = await import("@/lib/inngest/client");
    await inngest.send({
      name: "content/cmo.review",
      data: {
        organizationId: params.organizationId,
        brandId: params.brandId,
        itemIds: params.itemIds,
      },
    });
  } catch {
    // Non-blocking when event key missing (local scripts)
  }
}

export async function runCmoBackfillForBrand(params: {
  organizationId: string;
  brandId: string;
  limit?: number;
}): Promise<{ reviewed: number; results: CmoReviewResult[] }> {
  const enabled = await isCmoEnabledForBrand(params);
  if (!enabled) {
    return { reviewed: 0, results: [] };
  }

  const supabase = createAdminClient();
  const { data: items } = await supabase
    .from("content_items")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .eq("status", "pending_approval")
    .order("created_at", { ascending: true })
    .limit(params.limit ?? 50);

  const results: CmoReviewResult[] = [];
  for (const row of items ?? []) {
    try {
      results.push(
        await reviewContentItemAsCmo({
          organizationId: params.organizationId,
          brandId: params.brandId,
          itemId: row.id,
        }),
      );
    } catch (err) {
      results.push({
        itemId: row.id,
        outcome: "skipped",
        detail: err instanceof Error ? err.message : "failed",
      });
    }
  }
  return { reviewed: results.length, results };
}
