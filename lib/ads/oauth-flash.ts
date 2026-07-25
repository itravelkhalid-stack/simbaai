import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { signOAuthState, verifyOAuthState } from "@/lib/crypto";

const COOKIE_NAME = "ads_oauth_flash";
const MAX_MESSAGE_CHARS = 1800;
const MAX_AGE_SEC = 120;
const GENERIC_MESSAGE = "Connection failed. Please try connecting again.";

function truncateMessage(message: string) {
  const trimmed = message.trim() || "oauth_failed";
  if (trimmed.length <= MAX_MESSAGE_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_MESSAGE_CHARS)}…`;
}

/** Redirect to Ads connections with a short error code; full text lives in an httpOnly cookie. */
export function adsConnectionsErrorRedirect(site: string, message: string) {
  const res = NextResponse.redirect(`${site}/ads/connections?error=1`);
  try {
    const token = signOAuthState({
      kind: "error",
      message: truncateMessage(message),
      ts: String(Date.now()),
    });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SEC,
    });
  } catch {
    // Signing/cookie failures must never block the redirect.
  }
  return res;
}

export function adsConnectionsConnectedRedirect(
  site: string,
  platform: string,
) {
  const res = NextResponse.redirect(
    `${site}/ads/connections?connected=${encodeURIComponent(platform)}`,
  );
  try {
    res.cookies.delete(COOKIE_NAME);
  } catch {
    // Non-fatal.
  }
  return res;
}

/**
 * Read the flash error for the connections page.
 *
 * Read-only on purpose: cookies cannot be modified during a Server Component
 * render, so the cookie self-expires via its short max-age instead of being
 * deleted here. Any malformed or expired value degrades to a generic message.
 */
export async function consumeAdsOAuthFlashError(
  errorParam: string | undefined,
): Promise<string | null> {
  try {
    const jar = await cookies();
    const raw = jar.get(COOKIE_NAME)?.value;

    if (raw) {
      try {
        const payload = verifyOAuthState(raw);
        const ts = Number(payload.ts);
        const fresh = !Number.isFinite(ts) || Date.now() - ts <= MAX_AGE_SEC * 1000;
        if (payload.kind === "error" && payload.message && fresh) {
          return payload.message;
        }
      } catch {
        // Tampered / unsigned / unparseable cookie: fall through.
      }
    }

    // Legacy redirects put the full message in ?error= (except the "1" sentinel).
    if (errorParam && errorParam !== "1") return errorParam;
    if (errorParam === "1") return GENERIC_MESSAGE;
    return null;
  } catch {
    return errorParam ? GENERIC_MESSAGE : null;
  }
}
