import { NextResponse, type NextRequest } from "next/server";

import { assertSameOrigin } from "@/lib/security/csrf";
import { clientIp, rateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_ROUTES = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/callback",
  "/accept-invite",
]);

function isPublicPath(pathname: string) {
  return (
    PUBLIC_ROUTES.has(pathname) ||
    pathname.startsWith("/api/inngest") ||
    pathname.startsWith("/api/email/unsubscribe") ||
    pathname.startsWith("/api/email/webhooks") ||
    pathname.startsWith("/api/stripe/webhook") ||
    pathname.startsWith("/api/crm/webhooks") ||
    pathname.startsWith("/api/crm/forms") ||
    pathname.startsWith("/api/social/webhooks") ||
    pathname.startsWith("/api/automations/webhook") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  );
}

function applyRateLimit(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const ip = clientIp(request);

  let preset: { limit: number; windowMs: number } = RATE_LIMITS.publicApi;
  let keyPrefix = "api";

  if (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password"
  ) {
    preset = RATE_LIMITS.auth;
    keyPrefix = "auth";
  } else if (
    pathname.startsWith("/api/stripe/webhook") ||
    pathname.startsWith("/api/email/webhooks") ||
    pathname.startsWith("/api/crm/webhooks") ||
    pathname.startsWith("/api/social/webhooks") ||
    pathname.startsWith("/api/automations/webhook") ||
    pathname.startsWith("/api/inngest")
  ) {
    preset = RATE_LIMITS.webhook;
    keyPrefix = "webhook";
  } else if (pathname.startsWith("/api/") && pathname.includes("/oauth")) {
    preset = RATE_LIMITS.oauth;
    keyPrefix = "oauth";
  } else if (!pathname.startsWith("/api/")) {
    return null;
  }

  const result = rateLimit({
    key: `${keyPrefix}:${ip}:${pathname}`,
    ...preset,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)),
          ),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  return null;
}

export async function middleware(request: NextRequest) {
  const limited = applyRateLimit(request);
  if (limited) return limited;

  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const { user, supabaseResponse } = await updateSession(request);
  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
