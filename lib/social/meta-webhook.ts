import { createHmac, timingSafeEqual } from "crypto";

/**
 * Meta sends `X-Hub-Signature-256: sha256=<hex>` over the raw POST body,
 * signed with the app secret.
 */
export function verifyMetaWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string;
}): boolean {
  if (!params.signatureHeader) return false;

  const expected =
    "sha256=" +
    createHmac("sha256", params.appSecret)
      .update(params.rawBody, "utf8")
      .digest("hex");

  const provided = params.signatureHeader.trim();
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
