"use server";

import { revalidatePath } from "next/cache";

import {
  upsertOrgWebhookSecret,
  type WebhookProvider,
} from "@/lib/crm/webhook-auth";
import { requireActiveOrg } from "@/lib/org/require";

export type CrmWebhookActionResult = { error?: string; success?: string };

export async function saveCrmWebhookSecret(
  _prev: CrmWebhookActionResult,
  formData: FormData,
): Promise<CrmWebhookActionResult> {
  try {
    const { active } = await requireActiveOrg();
    if (active.role !== "org_owner" && active.role !== "org_admin") {
      return { error: "Only owners and admins can manage webhook secrets" };
    }
    const provider = String(formData.get("provider") ?? "") as WebhookProvider;
    const secret = String(formData.get("secret") ?? "").trim();
    if (!["shopify", "woocommerce", "forms", "generic"].includes(provider)) {
      return { error: "Invalid provider" };
    }
    if (secret.length < 8) return { error: "Secret must be at least 8 characters" };

    await upsertOrgWebhookSecret({
      organizationId: active.organization_id,
      provider,
      secret,
    });
    revalidatePath("/crm/webhooks");
    return { success: `Saved ${provider} webhook secret` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}
