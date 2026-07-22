"use client";

import { useActionState } from "react";

import {
  saveCrmWebhookSecret,
  type CrmWebhookActionResult,
} from "@/lib/crm/webhook-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: CrmWebhookActionResult = {};

const PROVIDERS = [
  {
    id: "shopify" as const,
    label: "Shopify",
    hint: "Uses X-Shopify-Hmac-Sha256. Point webhooks to /api/crm/webhooks/shopify?organization_id=…&brand_id=…",
  },
  {
    id: "woocommerce" as const,
    label: "WooCommerce",
    hint: "Uses X-WC-Webhook-Signature. Point to /api/crm/webhooks/woocommerce?organization_id=…&brand_id=…",
  },
  {
    id: "forms" as const,
    label: "Forms",
    hint: "Send x-crm-secret or Bearer token to /api/crm/forms",
  },
];

export function CrmWebhookSecretsForm({
  configured,
}: {
  configured: Record<string, boolean>;
}) {
  return (
    <div className="space-y-4">
      {PROVIDERS.map((p) => (
        <ProviderForm
          key={p.id}
          provider={p.id}
          label={p.label}
          hint={p.hint}
          configured={Boolean(configured[p.id])}
        />
      ))}
    </div>
  );
}

function ProviderForm({
  provider,
  label,
  hint,
  configured,
}: {
  provider: string;
  label: string;
  hint: string;
  configured: boolean;
}) {
  const [state, action, pending] = useActionState(saveCrmWebhookSecret, initial);
  return (
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <input type="hidden" name="provider" value={provider} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{label}</h2>
        <span className="text-xs text-muted-foreground">
          {configured ? "Secret configured" : "Not set"}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{hint}</p>
      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription>{state.error ?? state.success}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor={`secret-${provider}`}>HMAC / shared secret</Label>
        <Input
          id={`secret-${provider}`}
          name="secret"
          type="password"
          autoComplete="off"
          required
          minLength={8}
          placeholder={configured ? "•••••••• (replace)" : "Enter secret"}
        />
      </div>
      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Saving…" : "Save secret"}
      </Button>
    </form>
  );
}
