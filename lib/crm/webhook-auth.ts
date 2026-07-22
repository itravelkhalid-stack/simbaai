import { createHmac, timingSafeEqual } from "crypto";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type WebhookProvider = "shopify" | "woocommerce" | "forms" | "generic";

export async function getOrgWebhookSecret(
  organizationId: string,
  provider: WebhookProvider,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("org_webhook_secrets")
    .select("secret")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .maybeSingle();
  if (!data?.secret) return null;
  try {
    return decryptSecret(data.secret);
  } catch {
    // Legacy plaintext secrets (pre-encryption) still verify
    return data.secret;
  }
}

export async function upsertOrgWebhookSecret(params: {
  organizationId: string;
  provider: WebhookProvider;
  secret: string;
}) {
  const supabase = createAdminClient();
  const encrypted = encryptSecret(params.secret.trim());
  const { error } = await supabase.from("org_webhook_secrets").upsert(
    {
      organization_id: params.organizationId,
      provider: params.provider,
      secret: encrypted,
    },
    { onConflict: "organization_id,provider" },
  );
  if (error) throw new Error(error.message);
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function verifyHmacSha256Base64(params: {
  rawBody: string;
  secret: string;
  signature: string;
}) {
  const digest = createHmac("sha256", params.secret)
    .update(params.rawBody, "utf8")
    .digest("base64");
  return safeEqual(digest, params.signature.trim());
}

export function verifyHmacSha256Hex(params: {
  rawBody: string;
  secret: string;
  signature: string;
}) {
  const digest = createHmac("sha256", params.secret)
    .update(params.rawBody, "utf8")
    .digest("hex");
  const sig = params.signature.trim().replace(/^sha256=/i, "");
  return safeEqual(digest, sig);
}

/** Shared header token for forms/generic (Bearer or x-crm-secret). */
export function verifySharedSecretHeader(req: Request, secret: string) {
  const header =
    req.headers.get("x-crm-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  return Boolean(header) && safeEqual(header, secret);
}

/**
 * Verify CRM webhook authenticity.
 * Prefer per-org secrets; fall back to CRM_WEBHOOK_SECRET env for forms/generic.
 */
export async function verifyCrmWebhook(params: {
  req: Request;
  provider: WebhookProvider;
  organizationId: string;
  rawBody: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const orgSecret = await getOrgWebhookSecret(
    params.organizationId,
    params.provider,
  );
  const envSecret = process.env.CRM_WEBHOOK_SECRET ?? null;
  const secret = orgSecret ?? envSecret;

  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      return { ok: true };
    }
    return { ok: false, error: "Webhook secret not configured" };
  }

  if (params.provider === "shopify") {
    const signature = params.req.headers.get("x-shopify-hmac-sha256");
    if (!signature) return { ok: false, error: "Missing Shopify HMAC header" };
    if (
      !verifyHmacSha256Base64({
        rawBody: params.rawBody,
        secret,
        signature,
      })
    ) {
      return { ok: false, error: "Invalid Shopify HMAC" };
    }
    return { ok: true };
  }

  if (params.provider === "woocommerce") {
    const signature = params.req.headers.get("x-wc-webhook-signature");
    if (!signature) {
      return { ok: false, error: "Missing WooCommerce signature header" };
    }
    if (
      !verifyHmacSha256Base64({
        rawBody: params.rawBody,
        secret,
        signature,
      })
    ) {
      return { ok: false, error: "Invalid WooCommerce HMAC" };
    }
    return { ok: true };
  }

  // forms / generic
  if (!verifySharedSecretHeader(params.req, secret)) {
    return { ok: false, error: "Unauthorized" };
  }
  return { ok: true };
}
