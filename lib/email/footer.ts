import { createHmac, timingSafeEqual } from "crypto";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function secret() {
  return (
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.TOKEN_ENCRYPTION_KEY ||
    "dev-unsubscribe-secret"
  );
}

export function signUnsubscribeToken(payload: {
  orgId: string;
  email: string;
  campaignId?: string;
}) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyUnsubscribeToken(token: string) {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("Invalid unsubscribe token");
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid unsubscribe signature");
  }
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
    orgId: string;
    email: string;
    campaignId?: string;
  };
}

export function buildComplianceFooter(params: {
  organizationId: string;
  brandName: string;
  physicalAddress: string;
  email: string;
  campaignId?: string;
}) {
  const token = signUnsubscribeToken({
    orgId: params.organizationId,
    email: params.email.toLowerCase(),
    campaignId: params.campaignId,
  });
  const unsubscribeUrl = `${siteUrl()}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;

  const html = `
    <div>${escape(params.brandName)}</div>
    <div style="margin-top:6px;">${escape(params.physicalAddress)}</div>
    <div style="margin-top:10px;">
      <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
      · You received this email because you subscribed to updates from ${escape(params.brandName)}.
    </div>
  `;

  const text = `${params.brandName}\n${params.physicalAddress}\n\nUnsubscribe: ${unsubscribeUrl}`;

  return { html, text, unsubscribeUrl };
}

function escape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Non-removable footer injection for every outbound campaign email. */
export function injectComplianceFooter(html: string, footerHtml: string) {
  if (html.includes("data-growthos-compliance-footer")) {
    return html;
  }
  const footer = `<div data-growthos-compliance-footer="true">${footerHtml}</div>`;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${footer}</body>`);
  }
  return `${html}${footer}`;
}
