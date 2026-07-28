import "server-only";

import { cookies } from "next/headers";

import { INVITE_TOKEN_COOKIE } from "@/lib/constants";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function setInviteTokenCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(INVITE_TOKEN_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getInviteTokenCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(INVITE_TOKEN_COOKIE)?.value ?? null;
}

export async function clearInviteTokenCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(INVITE_TOKEN_COOKIE);
}

/** Extract invite token from a relative next path like /accept-invite?token=abc */
export function inviteTokenFromNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/")) return null;
  try {
    const url = new URL(next, "http://local.invalid");
    if (url.pathname !== "/accept-invite") return null;
    const token = url.searchParams.get("token");
    return token && token.length > 10 ? token : null;
  } catch {
    return null;
  }
}

export function isSafeRelativeNext(next: string | null | undefined): next is string {
  return Boolean(next && next.startsWith("/") && !next.startsWith("//"));
}

/**
 * Prefer explicit next (e.g. /accept-invite?token=…), else cookie token, else "/".
 */
export function resolvePostAuthPath(params: {
  next?: string | null;
  inviteToken?: string | null;
}): string {
  if (isSafeRelativeNext(params.next)) return params.next;
  if (params.inviteToken) {
    return `/accept-invite?token=${encodeURIComponent(params.inviteToken)}`;
  }
  return "/";
}
