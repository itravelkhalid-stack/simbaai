import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { mintPublishableBrandMediaUrl } from "@/lib/media/storage";

/** Sync content_items.media_urls from content_item_media join (publishable signed URLs). */
export async function syncContentItemMediaUrls(
  organizationId: string,
  contentItemId: string,
) {
  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from("content_item_media")
    .select("sort_order, media_asset_id")
    .eq("organization_id", organizationId)
    .eq("content_item_id", contentItemId)
    .order("sort_order");

  const assetIds = (rows ?? []).map((r) => r.media_asset_id);
  if (assetIds.length === 0) {
    await supabase
      .from("content_items")
      .update({ media_urls: [] })
      .eq("id", contentItemId)
      .eq("organization_id", organizationId);
    return;
  }

  const { data: assets } = await supabase
    .from("media_assets")
    .select("id, storage_path, public_url")
    .eq("organization_id", organizationId)
    .in("id", assetIds);

  const byId = new Map(
    (assets ?? []).map((a) => [
      a.id,
      {
        storage_path: a.storage_path as string,
        public_url: a.public_url as string,
      },
    ]),
  );

  const urls: string[] = [];
  for (const id of assetIds) {
    const row = byId.get(id);
    if (!row) continue;
    try {
      urls.push(await mintPublishableBrandMediaUrl(row.storage_path));
    } catch {
      if (row.public_url) urls.push(row.public_url);
    }
  }

  await supabase
    .from("content_items")
    .update({ media_urls: urls })
    .eq("id", contentItemId)
    .eq("organization_id", organizationId);
}

export async function attachAssetToContentItem(params: {
  organizationId: string;
  contentItemId: string;
  mediaAssetId: string;
  replace?: boolean;
}) {
  const supabase = createAdminClient();

  if (params.replace) {
    await supabase
      .from("content_item_media")
      .delete()
      .eq("organization_id", params.organizationId)
      .eq("content_item_id", params.contentItemId);
  }

  const { count } = await supabase
    .from("content_item_media")
    .select("id", { count: "exact", head: true })
    .eq("content_item_id", params.contentItemId);

  const { error } = await supabase.from("content_item_media").insert({
    organization_id: params.organizationId,
    content_item_id: params.contentItemId,
    media_asset_id: params.mediaAssetId,
    sort_order: params.replace ? 0 : (count ?? 0),
  });
  if (error && error.code !== "23505") throw new Error(error.message);

  await syncContentItemMediaUrls(params.organizationId, params.contentItemId);
}
