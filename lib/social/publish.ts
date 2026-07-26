import {
  ensureFreshAccessToken,
  getActiveConnection,
} from "@/lib/social/connections";
import {
  connectionCanPublishInstagram,
  getMetaPublishCapabilities,
  INSTAGRAM_SCOPE_REQUIRED_MESSAGE,
} from "@/lib/social/meta-capabilities";
import { isMetaTokenError } from "@/lib/social/meta";
import { getSocialProvider } from "@/lib/social/providers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentItem } from "@/lib/types/content";

const MAX_ATTEMPTS = 5;

function humanizePublishError(error: unknown, platform: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (/token|oauth|expired|unauthorized|401|190/i.test(message)) {
    return `${platform}: authentication failed — reconnect the account in Social. (${message})`;
  }
  // Instagram provider errors are already specific — don't rewrite them
  if (
    /aspect ratio|caption|carousel|not yet supported|business\/creator|container|not reachable|publicly readable/i.test(
      message,
    )
  ) {
    return `${platform}: ${message}`;
  }
  if (/media|image|video|url/i.test(message)) {
    return `${platform}: media upload/publish failed — Instagram needs a public HTTPS image URL. (${message})`;
  }
  if (/rate|429|throttle/i.test(message)) {
    return `${platform}: rate limited — will retry automatically. (${message})`;
  }
  return `${platform}: publish failed — ${message}`;
}

function backoffMs(attempt: number) {
  return Math.min(60_000, 2 ** attempt * 1000);
}

async function notifyPublishFailure(params: {
  organizationId: string;
  contentItemId: string;
  platform: string;
  message: string;
  tokenError: boolean;
}) {
  try {
    const { notifyOrgAdmins } = await import("@/lib/notifications/notify");
    await notifyOrgAdmins({
      organizationId: params.organizationId,
      title: params.tokenError
        ? `${params.platform} reconnect needed`
        : `${params.platform} publish failed`,
      body: params.message,
      link: `/content/${params.contentItemId}`,
      category: "blockers",
    });
  } catch {
    // non-blocking
  }
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

  const { getLatestComplianceCheck } = await import("@/lib/compliance/check");
  const {
    authorizeAgentAction,
    recordAutonomousAction,
  } = await import("@/lib/autonomy/authorize");
  const latestCompliance = await getLatestComplianceCheck({
    organizationId: typed.organization_id,
    entityType: "content",
    entityId: itemId,
  });
  const complianceStatus =
    latestCompliance?.status === "fail" ||
    latestCompliance?.status === "warn" ||
    latestCompliance?.status === "pass"
      ? latestCompliance.status
      : null;

  const auth = await authorizeAgentAction({
    organizationId: typed.organization_id,
    brandId: typed.brand_id,
    channel: "organic_social",
    action: typed.status === "scheduled" ? "content_schedule" : "organic_publish",
    agentName: "social_publisher",
    entityType: "content",
    entityId: itemId,
    complianceStatus,
    allowAsRecommendation: true,
  });
  if (!auth.mayExecute) {
    const message = auth.reason;
    if (auth.mustQueue || complianceStatus === "fail") {
      await supabase
        .from("content_items")
        .update({
          status: "pending_approval",
          publish_error: message,
        })
        .eq("id", itemId);
    }
    return { skipped: true as const, reason: message };
  }

  if (
    typed.platform === "instagram" &&
    (!(typed.media_urls ?? []).length)
  ) {
    const message =
      "Instagram publishing requires at least one publicly reachable image URL. Upload media on the content item.";
    await supabase
      .from("content_items")
      .update({ publish_error: message, status: "publish_failed" })
      .eq("id", itemId);
    await notifyPublishFailure({
      organizationId: typed.organization_id,
      contentItemId: itemId,
      platform: typed.platform,
      message,
      tokenError: false,
    });
    throw new Error(message);
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
        `No active ${typed.platform} connection for this brand. Connect it in Social.`,
      );
    }

    const capabilities = getMetaPublishCapabilities({
      scopes: connection.scopes,
    });

    if (typed.platform === "instagram") {
      if (
        !connectionCanPublishInstagram({
          scopes: connection.scopes,
          metadata: connection.metadata,
          platform: connection.platform,
        })
      ) {
        throw new Error(INSTAGRAM_SCOPE_REQUIRED_MESSAGE);
      }
    }

    const { accessToken, connection: fresh } =
      await ensureFreshAccessToken(connection);
    const provider = getSocialProvider(typed.platform);
    const result = await provider.publishPost({
      accessToken,
      accountId: fresh.account_id,
      metadata: {
        ...(fresh.metadata ?? {}),
        capabilities,
      },
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

    if (auth.mode === "autonomous") {
      await recordAutonomousAction({
        organizationId: typed.organization_id,
        brandId: typed.brand_id,
        agentName: "social_publisher",
        action: "organic_publish",
        entityType: "content",
        entityId: itemId,
        summary: `Published ${typed.platform} post ${itemId}`,
        after: { platform_post_id: result.platformPostId },
        link: `/content/${itemId}`,
      });
    }

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
    const tokenError = isMetaTokenError(message);
    const terminal = attempts >= MAX_ATTEMPTS || tokenError;

    if (tokenError) {
      await supabase
        .from("social_connections")
        .update({
          status: "expired",
          last_error: message,
        })
        .eq("organization_id", typed.organization_id)
        .eq("brand_id", typed.brand_id)
        .eq("platform", typed.platform)
        .eq("status", "active");
    }

    await supabase
      .from("content_items")
      .update({
        publish_error: message,
        status: terminal ? "publish_failed" : typed.status,
      })
      .eq("id", itemId);

    if (!terminal) {
      await supabase
        .from("content_items")
        .update({
          publish_error: `${message} Retry after ~${Math.round(backoffMs(attempts) / 1000)}s.`,
        })
        .eq("id", itemId);
    }

    if (terminal || tokenError) {
      await notifyPublishFailure({
        organizationId: typed.organization_id,
        contentItemId: itemId,
        platform: typed.platform,
        message,
        tokenError,
      });
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
