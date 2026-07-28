import { NextResponse } from "next/server";

import {
  clearInviteTokenCookie,
  getInviteTokenCookie,
  setInviteTokenCookie,
} from "@/lib/org/invite-cookie";
import { setActiveOrganizationId } from "@/lib/org/session";
import { createClient } from "@/lib/supabase/server";

function friendlyInviteError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("expired")) {
    return "This invitation has expired. Ask your admin to send a new one.";
  }
  if (lower.includes("no longer pending") || lower.includes("revoked")) {
    return "This invitation is no longer valid (revoked or already used).";
  }
  if (lower.includes("not found")) {
    return "This invitation link is invalid or has been removed.";
  }
  if (lower.includes("does not match")) {
    return "Sign in with the email address this invitation was sent to.";
  }
  return message;
}

/**
 * Completes invite acceptance after auth (auto-join for signed-in invitees).
 * GET /accept-invite/complete?token=...
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token =
    searchParams.get("token") ?? (await getInviteTokenCookie()) ?? "";

  if (!token) {
    return NextResponse.redirect(
      `${origin}/accept-invite?error=${encodeURIComponent("Missing invitation token")}`,
    );
  }

  await setInviteTokenCookie(token);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = `/accept-invite?token=${encodeURIComponent(token)}`;
    return NextResponse.redirect(
      `${origin}/login?next=${encodeURIComponent(next)}`,
    );
  }

  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });

  if (error) {
    return NextResponse.redirect(
      `${origin}/accept-invite?token=${encodeURIComponent(token)}&error=${encodeURIComponent(friendlyInviteError(error.message))}`,
    );
  }

  const membership = Array.isArray(data) ? data[0] : data;
  if (membership?.organization_id) {
    await setActiveOrganizationId(membership.organization_id);
  }

  await clearInviteTokenCookie();
  return NextResponse.redirect(`${origin}/`);
}
