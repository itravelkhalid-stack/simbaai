"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@/lib/validations/auth";
import { clearActiveOrganizationId } from "@/lib/org/session";
import {
  getInviteTokenCookie,
  inviteTokenFromNext,
  isSafeRelativeNext,
  resolvePostAuthPath,
  setInviteTokenCookie,
} from "@/lib/org/invite-cookie";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export type ActionResult = {
  error?: string;
  success?: string;
};

async function preserveInviteFromNext(next: string | null | undefined) {
  const token = inviteTokenFromNext(next);
  if (token) {
    await setInviteTokenCookie(token);
  }
}

async function postAuthRedirect(nextFromForm: string | null | undefined) {
  await preserveInviteFromNext(nextFromForm);
  const cookieToken = await getInviteTokenCookie();
  const path = resolvePostAuthPath({
    next: isSafeRelativeNext(nextFromForm) ? nextFromForm : null,
    inviteToken: cookieToken,
  });
  redirect(path);
}

export async function signUpWithEmail(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const next = String(formData.get("next") ?? "") || null;
  await preserveInviteFromNext(next);

  const parsed = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const callbackNext = isSafeRelativeNext(next)
    ? next
    : resolvePostAuthPath({
        inviteToken: await getInviteTokenCookie(),
      });

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${siteUrl()}/callback?next=${encodeURIComponent(callbackNext)}`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return {
    success: "Check your email to verify your account before signing in.",
  };
}

export async function signInWithEmail(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const next = String(formData.get("next") ?? "") || null;

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  await postAuthRedirect(next);
  return {};
}

export async function signInWithGoogle(formData?: FormData): Promise<void> {
  const nextRaw = String(formData?.get("next") ?? "/") || "/";
  const next = isSafeRelativeNext(nextRaw) ? nextRaw : "/";
  await preserveInviteFromNext(next);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl()}/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.url) {
    redirect(data.url);
  }

  throw new Error("Unable to start Google sign-in");
}

export async function requestPasswordReset(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: "If that email exists, a reset link has been sent." };
}

export async function updatePassword(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user.id);
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearActiveOrganizationId();
  redirect("/login");
}
