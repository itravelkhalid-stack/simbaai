import { NextResponse } from "next/server";

import {
  getInviteTokenCookie,
  inviteTokenFromNext,
  isSafeRelativeNext,
  resolvePostAuthPath,
  setInviteTokenCookie,
} from "@/lib/org/invite-cookie";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");

  const fromNext = inviteTokenFromNext(nextParam);
  if (fromNext) {
    await setInviteTokenCookie(fromNext);
  }

  const cookieToken = (await getInviteTokenCookie()) ?? fromNext;
  const next = resolvePostAuthPath({
    next: isSafeRelativeNext(nextParam) ? nextParam : null,
    inviteToken: cookieToken,
  });

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
