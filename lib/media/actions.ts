"use server";

import { revalidatePath } from "next/cache";

import { writeAuditEvent } from "@/lib/compliance/audit";
import { inngest } from "@/lib/inngest/client";
import {
  deleteBrandMediaFile,
  uploadBrandMediaFile,
} from "@/lib/media/storage";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { BRAND_ASSET_TAGS } from "@/lib/types/media";
import {
  attachContentMediaSchema,
  detachContentMediaSchema,
  guidelinesProposalActionSchema,
  mediaDeleteSchema,
  mediaUpdateTagsSchema,
  mediaUploadMetaSchema,
} from "@/lib/validations/media";

export type MediaActionResult = {
  error?: string;
  success?: string;
  assetId?: string;
};

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot modify media");
  }
  return ctx;
}

function parseTags(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean)
    .slice(0, 20);
}

async function syncContentItemMediaUrls(
  organizationId: string,
  contentItemId: string,
) {
  const supabase = await createClient();
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
    .select("id, public_url")
    .eq("organization_id", organizationId)
    .in("id", assetIds);

  const byId = new Map((assets ?? []).map((a) => [a.id, a.public_url]));
  const urls = assetIds
    .map((id) => byId.get(id))
    .filter((u): u is string => Boolean(u));

  await supabase
    .from("content_items")
    .update({ media_urls: urls })
    .eq("id", contentItemId)
    .eq("organization_id", organizationId);
}

export async function uploadMediaAsset(
  _prev: MediaActionResult,
  formData: FormData,
): Promise<MediaActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload" };
  }

  const parsed = mediaUploadMetaSchema.safeParse({
    brandId: formData.get("brandId"),
    tags: formData.get("tags") || "",
    reservedTag: formData.get("reservedTag") || undefined,
    type: formData.get("type") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const { user, active } = await assertCanWrite();
    const tags = parseTags(parsed.data.tags);
    const reserved = parsed.data.reservedTag?.trim();
    if (reserved && !tags.includes(reserved)) tags.push(reserved);

    const uploaded = await uploadBrandMediaFile({
      organizationId: active.organization_id,
      brandId: parsed.data.brandId,
      file,
      assetType: parsed.data.type,
      reservedTag: reserved,
    });

    const supabase = await createClient();

    // Reserved logo/guidelines slots: clear previous tag on same brand
    if (reserved) {
      const { data: existing } = await supabase
        .from("media_assets")
        .select("id, tags")
        .eq("organization_id", active.organization_id)
        .eq("brand_id", parsed.data.brandId)
        .contains("tags", [reserved]);
      for (const row of existing ?? []) {
        const nextTags = ((row.tags as string[]) ?? []).filter((t) => t !== reserved);
        await supabase
          .from("media_assets")
          .update({ tags: nextTags, updated_at: new Date().toISOString() })
          .eq("id", row.id);
      }
    }

    const { data: asset, error } = await supabase
      .from("media_assets")
      .insert({
        organization_id: active.organization_id,
        brand_id: parsed.data.brandId,
        type: uploaded.assetType,
        storage_path: uploaded.path,
        public_url: uploaded.publicUrl,
        filename: file.name,
        mime_type: uploaded.mimeType,
        size_bytes: uploaded.sizeBytes,
        tags,
        source: "upload",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !asset) return { error: error?.message ?? "Failed to save asset" };

    // Keep brands.logo_url in sync for primary logo
    if (reserved === BRAND_ASSET_TAGS.logoPrimary) {
      await supabase
        .from("brands")
        .update({ logo_url: uploaded.publicUrl })
        .eq("id", parsed.data.brandId)
        .eq("organization_id", active.organization_id);
    }

    // Queue guidelines PDF ingestion (never auto-applies)
    if (reserved === BRAND_ASSET_TAGS.guidelinesDoc || uploaded.assetType === "document") {
      if (
        reserved === BRAND_ASSET_TAGS.guidelinesDoc ||
        file.type === "application/pdf"
      ) {
        const { data: run } = await supabase
          .from("agent_runs")
          .insert({
            organization_id: active.organization_id,
            module: "brand",
            agent_name: "brand_guidelines_pdf",
            status: "queued",
            input: {
              brandId: parsed.data.brandId,
              mediaAssetId: asset.id,
            },
            progress: 0,
          })
          .select("id")
          .single();

        if (run) {
          await inngest.send({
            name: "brand/guidelines.pdf.ingest",
            data: {
              organizationId: active.organization_id,
              brandId: parsed.data.brandId,
              mediaAssetId: asset.id,
              agentRunId: run.id,
              userId: user.id,
            },
          });
        }
      }
    }

    revalidatePath("/brand/media");
    revalidatePath("/brand/guidelines");
    revalidatePath("/brand");
    return { success: "Uploaded", assetId: asset.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

export async function updateMediaAssetTags(
  _prev: MediaActionResult,
  formData: FormData,
): Promise<MediaActionResult> {
  const parsed = mediaUpdateTagsSchema.safeParse({
    assetId: formData.get("assetId"),
    tags: formData.get("tags") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const { active } = await assertCanWrite();
    const supabase = await createClient();
    const { error } = await supabase
      .from("media_assets")
      .update({
        tags: parseTags(parsed.data.tags),
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.assetId)
      .eq("organization_id", active.organization_id);
    if (error) return { error: error.message };
    revalidatePath("/brand/media");
    return { success: "Tags updated" };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Update failed",
    };
  }
}

export async function deleteMediaAsset(formData: FormData) {
  const parsed = mediaDeleteSchema.safeParse({
    assetId: formData.get("assetId"),
  });
  if (!parsed.success) throw new Error("Invalid asset");

  const { active } = await assertCanWrite();
  const supabase = await createClient();
  const { data: asset } = await supabase
    .from("media_assets")
    .select("*")
    .eq("id", parsed.data.assetId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!asset) throw new Error("Asset not found");

  const { error } = await supabase
    .from("media_assets")
    .delete()
    .eq("id", asset.id)
    .eq("organization_id", active.organization_id);
  if (error) throw new Error(error.message);

  try {
    await deleteBrandMediaFile(asset.storage_path);
  } catch {
    // Row deleted; storage cleanup best-effort
  }

  revalidatePath("/brand/media");
  revalidatePath("/brand/guidelines");
}

export async function attachMediaToContentItem(
  _prev: MediaActionResult,
  formData: FormData,
): Promise<MediaActionResult> {
  const parsed = attachContentMediaSchema.safeParse({
    itemId: formData.get("itemId"),
    assetId: formData.get("assetId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const { active } = await assertCanWrite();
    const supabase = await createClient();

    const [{ data: item }, { data: asset }] = await Promise.all([
      supabase
        .from("content_items")
        .select("id, brand_id")
        .eq("id", parsed.data.itemId)
        .eq("organization_id", active.organization_id)
        .single(),
      supabase
        .from("media_assets")
        .select("id, brand_id, public_url, type")
        .eq("id", parsed.data.assetId)
        .eq("organization_id", active.organization_id)
        .single(),
    ]);
    if (!item || !asset) return { error: "Item or asset not found" };
    if (item.brand_id !== asset.brand_id) {
      return { error: "Media must belong to the same brand as the content item" };
    }
    if (asset.type === "document" || asset.type === "font") {
      return { error: "Only images, logos, or videos can attach to content items" };
    }

    const { count } = await supabase
      .from("content_item_media")
      .select("id", { count: "exact", head: true })
      .eq("content_item_id", item.id);

    const { error } = await supabase.from("content_item_media").insert({
      organization_id: active.organization_id,
      content_item_id: item.id,
      media_asset_id: asset.id,
      sort_order: count ?? 0,
    });
    if (error) {
      if (error.code === "23505") return { error: "Already attached" };
      return { error: error.message };
    }

    await syncContentItemMediaUrls(active.organization_id, item.id);
    revalidatePath(`/content/${item.id}`);
    revalidatePath("/content/queue");
    revalidatePath("/content/calendar");
    return { success: "Media attached" };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Attach failed",
    };
  }
}

export async function detachMediaFromContentItem(formData: FormData) {
  const parsed = detachContentMediaSchema.safeParse({
    itemId: formData.get("itemId"),
    assetId: formData.get("assetId"),
  });
  if (!parsed.success) throw new Error("Invalid input");

  const { active } = await assertCanWrite();
  const supabase = await createClient();
  const { error } = await supabase
    .from("content_item_media")
    .delete()
    .eq("content_item_id", parsed.data.itemId)
    .eq("media_asset_id", parsed.data.assetId)
    .eq("organization_id", active.organization_id);
  if (error) throw new Error(error.message);

  await syncContentItemMediaUrls(active.organization_id, parsed.data.itemId);
  revalidatePath(`/content/${parsed.data.itemId}`);
  revalidatePath("/content/queue");
  revalidatePath("/content/calendar");
}

export async function approveGuidelinesProposal(formData: FormData) {
  const parsed = guidelinesProposalActionSchema.safeParse({
    proposalId: formData.get("proposalId"),
  });
  if (!parsed.success) throw new Error("Invalid proposal");

  const { user, active } = await assertCanWrite();
  const supabase = await createClient();
  const { data: proposal } = await supabase
    .from("brand_guidelines_proposals")
    .select("*")
    .eq("id", parsed.data.proposalId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") throw new Error("Proposal already reviewed");

  const proposed = proposal.proposed as {
    brand_voice?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
    font_heading?: string | null;
    font_body?: string | null;
    guidelines?: Record<string, unknown>;
  };

  const { error } = await supabase
    .from("brands")
    .update({
      brand_voice: proposed.brand_voice ?? null,
      primary_color: proposed.primary_color ?? null,
      secondary_color: proposed.secondary_color ?? null,
      accent_color: proposed.accent_color ?? null,
      font_heading: proposed.font_heading ?? null,
      font_body: proposed.font_body ?? null,
      guidelines: proposed.guidelines ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposal.brand_id)
    .eq("organization_id", active.organization_id);
  if (error) throw new Error(error.message);

  await supabase
    .from("brand_guidelines_proposals")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposal.id);

  await writeAuditEvent({
    organizationId: active.organization_id,
    actorUserId: user.id,
    action: "approval",
    entityType: "brand",
    entityId: proposal.brand_id,
    summary: "Approved guidelines PDF extraction",
    before: proposal.current_snapshot as Record<string, unknown>,
    after: proposed as Record<string, unknown>,
  });

  revalidatePath("/brand/guidelines");
  revalidatePath("/brand/media");
  revalidatePath("/brand");
}

export async function rejectGuidelinesProposal(formData: FormData) {
  const parsed = guidelinesProposalActionSchema.safeParse({
    proposalId: formData.get("proposalId"),
  });
  if (!parsed.success) throw new Error("Invalid proposal");

  const { user, active } = await assertCanWrite();
  const supabase = await createClient();
  const { error } = await supabase
    .from("brand_guidelines_proposals")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.proposalId)
    .eq("organization_id", active.organization_id)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  revalidatePath("/brand/guidelines");
  revalidatePath("/brand/media");
}
