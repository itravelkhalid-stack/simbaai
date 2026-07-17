"use server";

import { revalidatePath } from "next/cache";

import { canManageTeam } from "@/lib/org/session";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { EmailDigestPreference } from "@/lib/types/platform";
import { NOTIFICATION_CATEGORIES } from "@/lib/types/platform";
import { ensureDefaultNotificationPreferences } from "@/lib/notifications/notify";

export async function markNotificationRead(formData: FormData) {
  const { user } = await requireActiveOrg();
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/");
}

export async function markAllNotificationsRead() {
  const { user, active } = await requireActiveOrg();
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("organization_id", active.organization_id)
    .is("read_at", null);
  revalidatePath("/");
}

export async function updateNotificationPreferences(formData: FormData) {
  const { user } = await requireActiveOrg();
  await ensureDefaultNotificationPreferences(user.id);

  const supabase = await createClient();
  for (const category of NOTIFICATION_CATEGORIES) {
    const emailDigest = String(
      formData.get(`email_${category}`) ?? "daily",
    ) as EmailDigestPreference;
    await supabase.from("notification_preferences").upsert(
      {
        user_id: user.id,
        category,
        email_digest: emailDigest,
      },
      { onConflict: "user_id,category" },
    );
  }
  revalidatePath("/settings/notifications");
}

export async function updateOrgSlackWebhook(formData: FormData) {
  const { active } = await requireActiveOrg();
  if (!canManageTeam(active.role)) {
    throw new Error("Admin only");
  }
  const webhook = String(formData.get("slack_webhook_url") ?? "").trim();
  const supabase = await createClient();
  await supabase.from("org_notification_settings").upsert(
    {
      organization_id: active.organization_id,
      slack_webhook_url: webhook || null,
    },
    { onConflict: "organization_id" },
  );
  revalidatePath("/settings/notifications");
}

export async function listRecentNotifications(limit = 20) {
  const { user, active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .eq("organization_id", active.organization_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
