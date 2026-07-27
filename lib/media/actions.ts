"use server";

import { revalidatePath } from "next/cache";

import { writeAuditEvent } from "@/lib/compliance/audit";
import { inngest } from "@/lib/inngest/client";
import {
  deleteBrandMediaFile,
  BRAND_MEDIA_BUCKET,
} from "@/lib/media/storage";
import { syncContentItemMediaUrls } from "@/lib/media/sync";
import { queueMediaVisionTag } from "@/lib/media/tag";
import { MAX_DIRECT_UPLOAD_BYTES } from "@/lib/media/upload-constants";
import { requireActiveOrg } from "@/lib/org/require";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { BRAND_ASSET_TAGS } from "@/lib/types/media";
import {
  attachContentMediaSchema,
  detachContentMediaSchema,
  guidelinesProposalActionSchema,
  mediaDeleteSchema,
  mediaUpdateTagsSchema,
  registerUploadedMediaSchema,
  replaceContentMediaSchema,
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

/**
 * Register a media_assets row for a file already in brand-media.
 * The browser uploads the bytes directly to Storage; this action never receives a File.
 */
export async function registerUploadedMediaAsset(
  _prev: MediaActionResult,
  formData: FormData,
): Promise<MediaActionResult> {
  const parsed = registerUploadedMediaSchema.safeParse({
    brandId: formData.get("brandId"),
    storagePath: formData.get("storagePath"),
    filename: formData.get("filename"),
    mimeType: formData.get("mimeType"),
    sizeBytes: formData.get("sizeBytes"),
    tags: formData.get("tags") || "",
    reservedTag: formData.get("reservedTag") || undefined,
    type: formData.get("type") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const { user, active } = await assertCanWrite();
    const orgId = active.organization_id;
    const path = parsed.data.storagePath;

    if (!path.startsWith(`${orgId}/${parsed.data.brandId}/`)) {
      return { error: "Storage path is not under this organization" };
    }
    if (path.includes("..")) {
      return { error: "Invalid storage path" };
    }
    if (parsed.data.sizeBytes > MAX_DIRECT_UPLOAD_BYTES) {
      return { error: "File must be 25MB or smaller" };
    }

    const supabase = await createClient();
    const { data: brand } = await supabase
      .from("brands")
      .select("id")
      .eq("id", parsed.data.brandId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!brand) return { error: "Brand not found" };

    // Confirm the object exists (client upload completed) without trusting the client alone.
    const admin = createAdminClient();
    const { data: listed, error: listError } = await admin.storage
      .from(BRAND_MEDIA_BUCKET)
      .list(`${orgId}/${parsed.data.brandId}`, {
        search: path.split("/").pop() ?? "",
        limit: 5,
      });
    if (listError) return { error: listError.message };
    const objectName = path.split("/").pop();
    const found = (listed ?? []).some((o) => o.name === objectName);
    if (!found) {
      return { error: "Uploaded file not found in storage — try again" };
    }

    const tags = parseTags(parsed.data.tags);
    const reserved = parsed.data.reservedTag?.trim();
    if (reserved && !tags.includes(reserved)) tags.push(reserved);

    const assetType =
      parsed.data.type ??
      (reserved?.startsWith("logo-")
        ? "logo"
        : reserved?.startsWith("font-")
          ? "font"
          : reserved === "guidelines-doc"
            ? "document"
            : parsed.data.mimeType.startsWith("video/")
              ? "video"
              : "image");

    const { data: publicUrlData } = admin.storage
      .from(BRAND_MEDIA_BUCKET)
      .getPublicUrl(path);

    if (reserved) {
      const { data: existing } = await supabase
        .from("media_assets")
        .select("id, tags")
        .eq("organization_id", orgId)
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
        organization_id: orgId,
        brand_id: parsed.data.brandId,
        type: assetType,
        storage_path: path,
        public_url: publicUrlData.publicUrl,
        filename: parsed.data.filename,
        mime_type: parsed.data.mimeType,
        size_bytes: parsed.data.sizeBytes,
        tags,
        source: "upload",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !asset) {
      return { error: error?.message ?? "Failed to save asset" };
    }

    if (reserved === BRAND_ASSET_TAGS.logoPrimary) {
      await supabase
        .from("brands")
        .update({ logo_url: publicUrlData.publicUrl })
        .eq("id", parsed.data.brandId)
        .eq("organization_id", orgId);
    }

    if (
      (reserved === BRAND_ASSET_TAGS.guidelinesDoc || assetType === "document") &&
      parsed.data.mimeType === "application/pdf"
    ) {
      const { data: run } = await supabase
        .from("agent_runs")
        .insert({
          organization_id: orgId,
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
            organizationId: orgId,
            brandId: parsed.data.brandId,
            mediaAssetId: asset.id,
            agentRunId: run.id,
            userId: user.id,
          },
        });
      }
    }

    if (assetType === "image" || assetType === "logo") {
      await queueMediaVisionTag({
        organizationId: orgId,
        brandId: parsed.data.brandId,
        mediaAssetId: asset.id,
        userId: user.id,
      });
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

/** @deprecated File bytes must not transit the server — use browser upload + registerUploadedMediaAsset. */
export async function uploadMediaAsset(
  _prev: MediaActionResult,
  _formData: FormData,
): Promise<MediaActionResult> {
  return {
    error:
      "Direct server upload is disabled. Refresh the page and upload again (browser → storage).",
  };
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

    const replace = formData.get("replace") === "1" || formData.get("replace") === "true";
    if (replace) {
      await supabase
        .from("content_item_media")
        .delete()
        .eq("organization_id", active.organization_id)
        .eq("content_item_id", item.id);
    }

    const { count } = await supabase
      .from("content_item_media")
      .select("id", { count: "exact", head: true })
      .eq("content_item_id", item.id);

    const { error } = await supabase.from("content_item_media").insert({
      organization_id: active.organization_id,
      content_item_id: item.id,
      media_asset_id: asset.id,
      sort_order: replace ? 0 : (count ?? 0),
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

/**
 * Register a client-uploaded file into the library, then attach to a content item.
 * Expects storage path metadata — never a File body.
 */
export async function registerAndAttachMediaToContentItem(
  _prev: MediaActionResult,
  formData: FormData,
): Promise<MediaActionResult> {
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return { error: "Missing content item" };

  const registered = await registerUploadedMediaAsset({}, formData);
  if (registered.error || !registered.assetId) {
    return { error: registered.error ?? "Upload failed" };
  }

  const attachFd = new FormData();
  attachFd.set("itemId", itemId);
  attachFd.set("assetId", registered.assetId);
  attachFd.set("replace", formData.get("replace") === "1" ? "1" : "0");
  const attached = await attachMediaToContentItem({}, attachFd);
  if (attached.error) return attached;
  return {
    success: "Uploaded to library and attached",
    assetId: registered.assetId,
  };
}

/** @deprecated Use browser upload + registerAndAttachMediaToContentItem. */
export async function uploadAndAttachMediaToContentItem(
  _prev: MediaActionResult,
  _formData: FormData,
): Promise<MediaActionResult> {
  return {
    error:
      "Direct server upload is disabled. Refresh the page and upload again (browser → storage).",
  };
}

export async function replaceContentItemMedia(
  _prev: MediaActionResult,
  formData: FormData,
): Promise<MediaActionResult> {
  const parsed = replaceContentMediaSchema.safeParse({
    itemId: formData.get("itemId"),
    assetId: formData.get("assetId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const fd = new FormData();
  fd.set("itemId", parsed.data.itemId);
  fd.set("assetId", parsed.data.assetId);
  fd.set("replace", "1");
  return attachMediaToContentItem({}, fd);
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
