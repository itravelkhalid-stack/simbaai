import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { signOAuthState, verifyOAuthState } from "@/lib/crypto";

const COOKIE_NAME = "ads_oauth_flash";
const MAX_MESSAGE_CHARS = 1800;
const MAX_AGE_SEC = 600;

function truncateMessage(message: string) {
  const trimmed = message.trim() || "oauth_failed";
  if (trimmed.length <= MAX_MESSAGE_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_MESSAGE_CHARS)}…`;
}

/** Redirect to Ads connections with a short error code; full text lives in an httpOnly cookie. */
export function adsConnectionsErrorRedirect(site: string, message: string) {
  const token = signOAuthState({
    kind: "error",
    message: truncateMessage(message),
    ts: String(Date.now()),
  });
  const res = NextResponse.redirect(`${site}/ads/connections?error=1`);
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
  return res;
}

export function adsConnectionsConnectedRedirect(
  site: string,
  platform: string,
) {
  const res = NextResponse.redirect(
    `${site}/ads/connections?connected=${encodeURIComponent(platform)}`,
  );
  res.cookies.delete(COOKIE_NAME);
  return res;
}

/** Read + clear flash error for the connections page (server-side). */
export async function consumeAdsOAuthFlashError(
  errorParam: string | undefined,
): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (raw) {
    jar.delete(COOKIE_NAME);
    try {
      const payload = verifyOAuthState(raw);
      if (payload.kind === "error" && payload.message) {
        const ts = Number(payload.ts);
        if (!Number.isFinite(ts) || Date.now() - ts <= MAX_AGE_SEC * 1000) {
          return payload.message;
        }
      }
    } catch {
      // fall through to legacy query text
    }
  }

  // Legacy: old redirects put the full message in ?error= (except sentinel "1")
  if (errorParam && errorParam !== "1") {
    return errorParam;
  }

  if (errorParam === "1") {
    return "OAuth failed. Please try connecting again.";
  }

  return null;
}
