import "server-only";

import sharp from "sharp";

import { createAdminClient } from "@/lib/supabase/admin";
import { BRAND_MEDIA_BUCKET } from "@/lib/media/storage";
import { suitableFormatsForDimensions } from "@/lib/media/format-fit";

const STORY_W = 1080;
const STORY_H = 1920;

/**
 * Create a 9:16 story asset: blurred full-bleed background + centered contain.
 * Returns new media_assets id or null.
 */
export async function deriveStoryFittedAsset(params: {
  organizationId: string;
  brandId: string;
  sourceAssetId: string;
}): Promise<{ assetId: string; storagePath: string } | null> {
  const supabase = createAdminClient();
  const { data: source } = await supabase
    .from("media_assets")
    .select("*")
    .eq("id", params.sourceAssetId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (!source?.storage_path) return null;

  const { data: file, error: dlErr } = await supabase.storage
    .from(BRAND_MEDIA_BUCKET)
    .download(source.storage_path);
  if (dlErr || !file) return null;

  const input = Buffer.from(await file.arrayBuffer());
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) return null;

  const background = await sharp(input)
    .resize(STORY_W, STORY_H, { fit: "cover" })
    .blur(28)
    .modulate({ brightness: 0.75 })
    .jpeg({ quality: 85 })
    .toBuffer();

  const foreground = await sharp(input)
    .resize(STORY_W, STORY_H, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  const fgMeta = await sharp(foreground).metadata();
  const left = Math.max(0, Math.round((STORY_W - (fgMeta.width ?? STORY_W)) / 2));
  const top = Math.max(0, Math.round((STORY_H - (fgMeta.height ?? STORY_H)) / 2));

  const fitted = await sharp(background)
    .composite([{ input: foreground, left, top }])
    .jpeg({ quality: 90 })
    .toBuffer();

  const filename = `story-fit-${source.id.slice(0, 8)}-${Date.now()}.jpg`;
  const storagePath = `${params.organizationId}/${params.brandId}/derived/${filename}`;

  const { error: upErr } = await supabase.storage
    .from(BRAND_MEDIA_BUCKET)
    .upload(storagePath, fitted, {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (upErr) return null;

  const { data: publicUrlData } = supabase.storage
    .from(BRAND_MEDIA_BUCKET)
    .getPublicUrl(storagePath);

  const suitable = suitableFormatsForDimensions(STORY_W, STORY_H);
  const { data: asset, error: insErr } = await supabase
    .from("media_assets")
    .insert({
      organization_id: params.organizationId,
      brand_id: params.brandId,
      type: "image",
      storage_path: storagePath,
      public_url: publicUrlData.publicUrl,
      filename,
      mime_type: "image/jpeg",
      width: STORY_W,
      height: STORY_H,
      size_bytes: fitted.byteLength,
      tags: ["derived", "story-fit"],
      suitable_formats: suitable,
      is_derived: true,
      derived_from_asset_id: source.id,
      source: "ai",
      description: `9:16 story fit derived from ${source.filename}`,
    })
    .select("id")
    .single();
  if (insErr || !asset) return null;

  return { assetId: asset.id, storagePath };
}

/** Probe width/height (+ suitable_formats) for an asset already in storage. */
export async function probeAndUpdateAssetDimensions(assetId: string): Promise<{
  width: number | null;
  height: number | null;
  suitable_formats: string[];
}> {
  const supabase = createAdminClient();
  const { data: asset } = await supabase
    .from("media_assets")
    .select("id, storage_path, organization_id, type, mime_type")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset?.storage_path) {
    return { width: null, height: null, suitable_formats: [] };
  }
  if (
    asset.type !== "image" &&
    asset.type !== "logo" &&
    !(asset.mime_type ?? "").startsWith("image/")
  ) {
    return { width: null, height: null, suitable_formats: [] };
  }

  const { data: file } = await supabase.storage
    .from(BRAND_MEDIA_BUCKET)
    .download(asset.storage_path);
  if (!file) return { width: null, height: null, suitable_formats: [] };

  const buf = Buffer.from(await file.arrayBuffer());
  const meta = await sharp(buf).metadata();
  const width = meta.width ?? null;
  const height = meta.height ?? null;
  const suitable_formats = suitableFormatsForDimensions(width, height);

  await supabase
    .from("media_assets")
    .update({
      width,
      height,
      suitable_formats,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assetId);

  return { width, height, suitable_formats };
}
