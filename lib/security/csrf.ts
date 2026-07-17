import type { NextRequest } from "next/server";

/**
 * Soft CSRF: require same-origin for state-changing requests that are not
 * webhook/Inngest signed endpoints. Complements Next.js Server Action origin checks.
 */
const CSRF_EXEMPT_PREFIXES = [
  "/api/inngest",
  "/api/stripe/webhook",
  "/api/email/webhooks",
  "/api/crm/webhooks",
  "/api/crm/forms",
  "/api/automations/webhook",
  "/api/email/unsubscribe",
  "/callback",
  "/api/social/oauth",
  "/api/ads/oauth",
  "/api/seo/gsc/callback",
  "/api/data/ga4/callback",
];

export function isCsrfExempt(pathname: string) {
  return CSRF_EXEMPT_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function assertSameOrigin(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  const { pathname } = request.nextUrl;
  if (isCsrfExempt(pathname)) return true;

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) {
    // Server Actions / same-site navigations may omit Origin in some browsers;
    // allow when sec-fetch-site is same-origin or none.
    const site = request.headers.get("sec-fetch-site");
    return site === "same-origin" || site === "none" || site === null;
  }

  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}
