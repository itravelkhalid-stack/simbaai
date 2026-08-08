"use server";

import { revalidatePath } from "next/cache";
import { runDestinationSeasonalityResearch } from "@/lib/ads/seasonality-research";
import { requireActiveOrg } from "@/lib/org/require";

export async function refreshSeasonalityAction(formData: FormData) {
  const { active } = await requireActiveOrg();
  if (active.role === "org_viewer") throw new Error("Viewers cannot run research");
  const brandId = String(formData.get("brandId") ?? "");
  if (!brandId) throw new Error("brandId required");
  await runDestinationSeasonalityResearch({
    organizationId: active.organization_id,
    brandId,
  });
  revalidatePath("/ads/seasonality");
}
