import { ensureFreshAccessToken } from "@/lib/social/connections";
import { getSocialProvider } from "@/lib/social/providers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentItem, ContentPlatform } from "@/lib/types/content";
import type { SocialConnection } from "@/lib/social/types";

export async function ingestMetricsForPublishedItems(limit = 100) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("status", "published")
    .not("platform_post_id", "is", null)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const results: Array<{ itemId: string; ok: boolean; error?: string }> = [];

  for (const raw of data ?? []) {
    const item = raw as ContentItem;
    try {
      const { data: connection } = await supabase
        .from("social_connections")
        .select("*")
        .eq("organization_id", item.organization_id)
        .eq("brand_id", item.brand_id)
        .eq("platform", item.platform)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (!connection) {
        results.push({
          itemId: item.id,
          ok: false,
          error: "missing connection",
        });
        continue;
      }

      const { accessToken, connection: fresh } = await ensureFreshAccessToken(
        connection,
      );
      const provider = getSocialProvider(item.platform);
      const metrics = await provider.getPostMetrics({
        accessToken,
        accountId: fresh.account_id,
        platformPostId: item.platform_post_id!,
        metadata: fresh.metadata,
      });

      const capturedAt = new Date();
      capturedAt.setUTCHours(0, 0, 0, 0);

      const { error: upsertError } = await supabase.from("content_metrics").upsert(
        {
          organization_id: item.organization_id,
          content_item_id: item.id,
          platform: item.platform,
          platform_post_id: item.platform_post_id!,
          captured_at: capturedAt.toISOString(),
          impressions: metrics.impressions,
          reach: metrics.reach,
          likes: metrics.likes,
          comments: metrics.comments,
          shares: metrics.shares,
          saves: metrics.saves,
          clicks: metrics.clicks,
          raw: metrics.raw ?? {},
        },
        { onConflict: "content_item_id,captured_at" },
      );

      if (upsertError) throw new Error(upsertError.message);
      results.push({ itemId: item.id, ok: true });
    } catch (err) {
      results.push({
        itemId: item.id,
        ok: false,
        error: err instanceof Error ? err.message : "metrics failed",
      });
    }
  }

  return results;
}

/**
 * Snapshot follower counts for active IG / Facebook connections into
 * social_account_metrics_daily (used by ig_followers / fb_followers KPIs).
 */
export async function ingestAccountFollowerMetrics() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("social_connections")
    .select("*")
    .eq("status", "active")
    .in("platform", ["instagram", "facebook"]);

  if (error) throw new Error(error.message);

  const metricDate = new Date().toISOString().slice(0, 10);
  const results: Array<{
    connectionId: string;
    platform: string;
    ok: boolean;
    followers?: number;
    error?: string;
  }> = [];

  for (const raw of data ?? []) {
    const connection = raw as SocialConnection;
    try {
      const provider = getSocialProvider(connection.platform as ContentPlatform);
      if (!provider.getAccountFollowers) {
        results.push({
          connectionId: connection.id,
          platform: connection.platform,
          ok: false,
          error: "followers not supported",
        });
        continue;
      }

      const { accessToken, connection: fresh } =
        await ensureFreshAccessToken(connection);
      const account = await provider.getAccountFollowers({
        accessToken,
        accountId: fresh.account_id,
        metadata: fresh.metadata,
      });

      const { error: upsertError } = await supabase
        .from("social_account_metrics_daily")
        .upsert(
          {
            organization_id: connection.organization_id,
            brand_id: connection.brand_id,
            connection_id: connection.id,
            platform: connection.platform,
            account_id: fresh.account_id,
            metric_date: metricDate,
            followers: account.followers,
            raw: account.raw ?? {},
          },
          {
            onConflict:
              "organization_id,brand_id,platform,account_id,metric_date",
          },
        );

      if (upsertError) throw new Error(upsertError.message);
      results.push({
        connectionId: connection.id,
        platform: connection.platform,
        ok: true,
        followers: account.followers,
      });
    } catch (err) {
      results.push({
        connectionId: connection.id,
        platform: connection.platform,
        ok: false,
        error: err instanceof Error ? err.message : "followers failed",
      });
    }
  }

  return results;
}

/** Latest follower count for a brand+platform within [fromDate, toDate]. */
export async function latestFollowersInPeriod(params: {
  organizationId: string;
  brandId: string;
  platform: "instagram" | "facebook";
  fromDate: string;
  toDate: string;
}): Promise<number> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("social_account_metrics_daily")
    .select("followers, metric_date")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .eq("platform", params.platform)
    .gte("metric_date", params.fromDate)
    .lte("metric_date", params.toDate)
    .order("metric_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.followers ?? 0);
}
