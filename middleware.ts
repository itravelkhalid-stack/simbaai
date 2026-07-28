import { NextResponse, type NextRequest } from "next/server";

import { INVITE_TOKEN_COOKIE } from "@/lib/constants";
import { assertSameOrigin } from "@/lib/security/csrf";
import { clientIp, rateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_ROUTES = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/change-password",
  "/callback",
  "/accept-invite",
]);

function isSafeRelativeNext(next: string | null): next is string {
  return Boolean(next && next.startsWith("/") && !next.startsWith("//"));
}

function isPublicPath(pathname: string) {
  return (
    PUBLIC_ROUTES.has(pathname) ||
    pathname.startsWith("/accept-invite") ||
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

  const { user, supabase, supabaseResponse } = await updateSession(request);
  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  // Persist invite token across auth redirects (cannot set cookies from RSC pages).
  if (pathname === "/accept-invite" || pathname.startsWith("/accept-invite/")) {
    const token = request.nextUrl.searchParams.get("token");
    if (token && token.length > 10) {
      supabaseResponse.cookies.set(INVITE_TOKEN_COOKIE, token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const next = `${pathname}${request.nextUrl.search}`;
    url.search = "";
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const next = request.nextUrl.searchParams.get("next");
    if (isSafeRelativeNext(next)) {
      return NextResponse.redirect(new URL(next, request.url));
    }
    const inviteToken = request.cookies.get(INVITE_TOKEN_COOKIE)?.value;
    if (inviteToken) {
      return NextResponse.redirect(
        new URL(
          `/accept-invite?token=${encodeURIComponent(inviteToken)}`,
          request.url,
        ),
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Admin-created / admin-reset accounts must change password before using the app.
  if (
    user &&
    pathname !== "/change-password" &&
    pathname !== "/callback" &&
    pathname !== "/login" &&
    !pathname.startsWith("/api/")
  ) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.must_change_password) {
      const url = request.nextUrl.clone();
      url.pathname = "/change-password";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
