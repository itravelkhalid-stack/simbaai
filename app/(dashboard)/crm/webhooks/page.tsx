import Link from "next/link";

import { CrmWebhookSecretsForm } from "@/components/crm/webhook-secrets-form";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";

export default async function CrmWebhooksPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_webhook_secrets")
    .select("provider")
    .eq("organization_id", active.organization_id);

  const configured: Record<string, boolean> = {};
  for (const row of data ?? []) {
    configured[row.provider] = true;
  }

  const canManage = active.role === "org_owner" || active.role === "org_admin";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/crm" className="text-sm text-muted-foreground underline">
          ← CRM
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          CRM webhook secrets
        </h1>
        <p className="mt-2 text-muted-foreground">
          Per-organization HMAC secrets for Shopify, WooCommerce, and form
          endpoints. Secrets are encrypted at rest.
        </p>
      </div>
      {canManage ? (
        <CrmWebhookSecretsForm configured={configured} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Only owners and admins can manage webhook secrets.
        </p>
      )}
    </div>
  );
}
