import { createAdminClient } from "@/lib/supabase/admin";
import type { BrandAutomationSettings } from "@/lib/types/automations";

export async function getBrandAutomationSettings(params: {
  organizationId: string;
  brandId: string;
}): Promise<BrandAutomationSettings> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("brand_automation_settings")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .maybeSingle();

  if (data) return data as BrandAutomationSettings;

  const { data: created, error } = await supabase
    .from("brand_automation_settings")
    .insert({
      organization_id: params.organizationId,
      brand_id: params.brandId,
      auto_publish_channels: [],
      daily_budget_action_cap_pence: 50_000,
    })
    .select("*")
    .single();
  if (error || !created) {
    return {
      id: "",
      organization_id: params.organizationId,
      brand_id: params.brandId,
      auto_publish_channels: [],
      daily_budget_action_cap_pence: 50_000,
      slack_webhook_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  return created as BrandAutomationSettings;
}

export function canAutoPublish(
  settings: BrandAutomationSettings,
  channel: string,
) {
  return (settings.auto_publish_channels ?? []).includes(channel);
}

export async function reserveAutomationBudget(params: {
  organizationId: string;
  brandId: string;
  amountPence: number;
  capPence: number;
}): Promise<{ allowed: boolean; used: number; remaining: number }> {
  if (params.amountPence <= 0) {
    return { allowed: true, used: 0, remaining: params.capPence };
  }
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: row } = await supabase
    .from("automation_budget_usage")
    .select("*")
    .eq("brand_id", params.brandId)
    .eq("usage_date", today)
    .maybeSingle();

  const used = row?.used_pence ?? 0;
  if (used + params.amountPence > params.capPence) {
    return {
      allowed: false,
      used,
      remaining: Math.max(0, params.capPence - used),
    };
  }

  await supabase.from("automation_budget_usage").upsert(
    {
      organization_id: params.organizationId,
      brand_id: params.brandId,
      usage_date: today,
      used_pence: used + params.amountPence,
    },
    { onConflict: "brand_id,usage_date" },
  );

  return {
    allowed: true,
    used: used + params.amountPence,
    remaining: params.capPence - used - params.amountPence,
  };
}
