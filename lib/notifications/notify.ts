import { createAdminClient } from "@/lib/supabase/admin";
import type {
  EmailDigestPreference,
  NotificationCategory,
} from "@/lib/types/platform";
import { NOTIFICATION_CATEGORIES } from "@/lib/types/platform";

async function getPreference(
  userId: string,
  category: NotificationCategory,
): Promise<EmailDigestPreference> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("notification_preferences")
    .select("email_digest")
    .eq("user_id", userId)
    .eq("category", category)
    .maybeSingle();
  return (data?.email_digest as EmailDigestPreference) ?? "immediate";
}

import { fetchWithRetry } from "@/lib/security/http";

async function sendResendEmail(params: {
  to: string;
  subject: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return;
  await fetchWithRetry(
    "resend",
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        text: params.text,
      }),
    },
    { retries: 2 },
  );
}

async function postOrgSlack(
  organizationId: string,
  title: string,
  body?: string,
) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("org_notification_settings")
    .select("slack_webhook_url")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const url = data?.slack_webhook_url;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `*${title}*${body ? `\n${body}` : ""}`,
      }),
    });
  } catch {
    // ignore slack failures
  }
}

/** Primary notification writer — in-app + preference-aware email + org Slack. */
export async function notifyUser(params: {
  organizationId: string;
  userId: string;
  title: string;
  body?: string;
  link?: string;
  category?: NotificationCategory;
  skipSlack?: boolean;
}) {
  const category = params.category ?? "general";
  const supabase = createAdminClient();

  await supabase.from("notifications").insert({
    organization_id: params.organizationId,
    user_id: params.userId,
    title: params.title,
    body: params.body ?? null,
    link: params.link ?? null,
    category,
  });

  if (!params.skipSlack) {
    await postOrgSlack(params.organizationId, params.title, params.body);
  }

  const digest = await getPreference(params.userId, category);
  if (digest === "off" || digest === "daily") return;

  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(
      params.userId,
    );
    const email = authUser.user?.email;
    if (!email) return;
    await sendResendEmail({
      to: email,
      subject: params.title,
      text: `${params.body ?? ""}\n\n${params.link ?? ""}`.trim(),
    });
  } catch {
    // ignore email failures
  }
}

export async function notifyOrgAdmins(params: {
  organizationId: string;
  title: string;
  body?: string;
  link?: string;
  category?: NotificationCategory;
}) {
  const supabase = createAdminClient();
  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", params.organizationId)
    .eq("status", "active")
    .in("role", ["org_owner", "org_admin"])
    .limit(20);

  for (const m of members ?? []) {
    await notifyUser({
      ...params,
      userId: m.user_id,
      skipSlack: true,
    });
  }
  // One Slack post for the org
  await postOrgSlack(params.organizationId, params.title, params.body);
}

export async function ensureDefaultNotificationPreferences(userId: string) {
  const supabase = createAdminClient();
  for (const category of NOTIFICATION_CATEGORIES) {
    await supabase.from("notification_preferences").upsert(
      {
        user_id: userId,
        category,
        email_digest: "immediate",
      },
      { onConflict: "user_id,category", ignoreDuplicates: true },
    );
  }
}

/** Daily digest for users with email_digest=daily. */
export async function sendDailyNotificationDigests() {
  const supabase = createAdminClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 1);

  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("user_id, category")
    .eq("email_digest", "daily")
    .limit(2000);

  const byUser = new Map<string, NotificationCategory[]>();
  for (const p of prefs ?? []) {
    const list = byUser.get(p.user_id) ?? [];
    list.push(p.category as NotificationCategory);
    byUser.set(p.user_id, list);
  }

  let sent = 0;
  for (const [userId, categories] of byUser) {
    const { data: notes } = await supabase
      .from("notifications")
      .select("title, body, link, category, created_at")
      .eq("user_id", userId)
      .in("category", categories)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(50);
    if (!notes?.length) continue;

    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const email = authUser.user?.email;
      if (!email) continue;
      const lines = notes.map(
        (n) =>
          `• [${n.category}] ${n.title}${n.body ? ` — ${n.body}` : ""}${n.link ? ` (${n.link})` : ""}`,
      );
      await sendResendEmail({
        to: email,
        subject: `GrowthOS daily digest (${notes.length})`,
        text: lines.join("\n"),
      });
      sent += 1;
    } catch {
      // continue
    }
  }
  return { sent, users: byUser.size };
}
