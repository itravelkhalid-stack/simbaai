import {
  ensureFreshAccessToken,
  getActiveConnection,
} from "@/lib/social/connections";
import { getSocialProvider } from "@/lib/social/providers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentItem } from "@/lib/types/content";

const MAX_ATTEMPTS = 5;

function humanizePublishError(error: unknown, platform: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (/token|oauth|expired|unauthorized|401/i.test(message)) {
    return `${platform}: authentication failed — reconnect the account in Settings → Connections. (${message})`;
  }
  if (/media|image|video|url/i.test(message)) {
    return `${platform}: media upload/publish failed — check that media URLs are public HTTPS. (${message})`;
  }
  if (/rate|429|throttle/i.test(message)) {
    return `${platform}: rate limited — will retry automatically. (${message})`;
  }
  return `${platform}: publish failed — ${message}`;
}

function backoffMs(attempt: number) {
  return Math.min(60_000, 2 ** attempt * 1000);
}

export async function publishContentItem(itemId: string) {
  const supabase = createAdminClient();
  const { data: item, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("id", itemId)
    .single();

  if (error || !item) throw new Error(error?.message ?? "Content item not found");
  const typed = item as ContentItem & {
    publish_attempts?: number;
    publish_error?: string | null;
  };

  if (typed.status !== "scheduled" && typed.status !== "approved") {
    return { skipped: true as const, reason: `status=${typed.status}` };
  }

  if (typed.scheduled_at && new Date(typed.scheduled_at).getTime() > Date.now()) {
    return { skipped: true as const, reason: "not_due" };
  }

  const attempts = (typed.publish_attempts ?? 0) + 1;
  await supabase
    .from("content_items")
    .update({
      publish_attempts: attempts,
      last_publish_attempt_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  try {
    const connection = await getActiveConnection({
      organizationId: typed.organization_id,
      brandId: typed.brand_id,
      platform: typed.platform,
    });

    if (!connection) {
      throw new Error(
        `No active ${typed.platform} connection for this brand. Connect it in Settings → Connections.`,
      );
    }

    const { accessToken, connection: fresh } = await ensureFreshAccessToken(connection);
    const provider = getSocialProvider(typed.platform);
    const result = await provider.publishPost({
      accessToken,
      accountId: fresh.account_id,
      metadata: fresh.metadata ?? {},
      copy: typed.copy,
      hashtags: typed.hashtags ?? [],
      mediaUrls: typed.media_urls ?? [],
      format: typed.format,
      structured: (typed.structured as Record<string, unknown>) ?? {},
    });

    await supabase
      .from("content_items")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        platform_post_id: result.platformPostId,
        publish_error: null,
      })
      .eq("id", itemId);

    try {
      const { emitAutomationEvent } = await import("@/lib/automations/runner");
      await emitAutomationEvent({
        organizationId: typed.organization_id,
        brandId: typed.brand_id,
        event: "post.published",
        data: {
          content_item_id: itemId,
          platform: typed.platform,
          platform_post_id: result.platformPostId,
        },
      });
    } catch {
      // non-blocking
    }

    return { ok: true as const, platformPostId: result.platformPostId };
  } catch (error) {
    const message = humanizePublishError(error, typed.platform);
    const terminal = attempts >= MAX_ATTEMPTS;

    await supabase
      .from("content_items")
      .update({
        publish_error: message,
        status: terminal ? "publish_failed" : typed.status,
      })
      .eq("id", itemId);

    if (!terminal) {
      // Soft signal for scheduler — next cron will retry; include backoff hint in error.
      await supabase
        .from("content_items")
        .update({
          publish_error: `${message} Retry after ~${Math.round(backoffMs(attempts) / 1000)}s.`,
        })
        .eq("id", itemId);
    }

    throw new Error(message);
  }
}

export async function listDueContentItems(limit = 25) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("status", "scheduled")
    .is("published_at", null)
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as ContentItem[];
}
