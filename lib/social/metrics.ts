import { ensureFreshAccessToken } from "@/lib/social/connections";
import { getSocialProvider } from "@/lib/social/providers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentItem } from "@/lib/types/content";

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
