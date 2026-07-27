import "server-only";

import { z } from "zod";

import { runClaudeJsonWithImage } from "@/lib/agents/claude-image";
import { mediaTagPrompt } from "@/lib/agents/prompts/brand/media-tag";
import { downloadBrandMediaBytes } from "@/lib/media/storage";
import { createAdminClient } from "@/lib/supabase/admin";

export const mediaVisionTagSchema = z.object({
  subject: z.preprocess(
    (v) => (typeof v === "string" ? v.slice(0, 200) : v),
    z.string().min(1).max(200),
  ),
  style: z.preprocess(
    (v) => (typeof v === "string" ? v.slice(0, 300) : v),
    z.string().min(1).max(300),
  ),
  colors: z.array(z.string()).max(8).default([]),
  description: z.preprocess(
    (v) => (typeof v === "string" ? v.slice(0, 800) : v),
    z.string().min(1).max(800),
  ),
  tags: z.array(z.string()).max(20).default([]),
  suitable_for: z.array(z.string()).max(12).default([]),
});

function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 48);
}

function toImageMediaType(
  mime: string,
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  if (mime === "image/jpg" || mime === "image/jpeg") return "image/jpeg";
  if (mime === "image/png") return "image/png";
  if (mime === "image/gif") return "image/gif";
  if (mime === "image/webp") return "image/webp";
  return null;
}

export async function tagMediaAssetWithVision(params: {
  organizationId: string;
  mediaAssetId: string;
  agentRunId: string;
}): Promise<{ ok: true }> {
  const supabase = createAdminClient();
  const started = Date.now();

  try {
    const { data: asset, error } = await supabase
      .from("media_assets")
      .select("*")
      .eq("id", params.mediaAssetId)
      .eq("organization_id", params.organizationId)
      .single();
    if (error || !asset) throw new Error(error?.message ?? "Asset not found");

    if (asset.type !== "image" && asset.type !== "logo") {
      await supabase
        .from("agent_runs")
        .update({
          status: "complete",
          progress: 100,
          output: { skipped: true, reason: "not_image" },
          duration_ms: Date.now() - started,
        })
        .eq("id", params.agentRunId);
      return { ok: true };
    }

    const mediaType = toImageMediaType(asset.mime_type ?? "");
    if (!mediaType) {
      await supabase
        .from("agent_runs")
        .update({
          status: "complete",
          progress: 100,
          output: { skipped: true, reason: "unsupported_mime" },
          duration_ms: Date.now() - started,
        })
        .eq("id", params.agentRunId);
      return { ok: true };
    }

    await supabase
      .from("agent_runs")
      .update({ status: "running", progress: 20 })
      .eq("id", params.agentRunId);

    const { bytes } = await downloadBrandMediaBytes(asset.storage_path);
    // Cap vision payload — Claude accepts large images but keep under ~4MB base64
    if (bytes.length > 4 * 1024 * 1024) {
      await supabase
        .from("agent_runs")
        .update({
          status: "complete",
          progress: 100,
          output: { skipped: true, reason: "image_too_large_for_vision" },
          duration_ms: Date.now() - started,
        })
        .eq("id", params.agentRunId);
      return { ok: true };
    }

    const result = await runClaudeJsonWithImage({
      system: mediaTagPrompt.system,
      user: mediaTagPrompt.buildUserPrompt({ filename: asset.filename }),
      schema: mediaVisionTagSchema,
      imageBase64: bytes.toString("base64"),
      mediaType,
      maxTokens: 800,
    });

    const aiTags = result.data.tags
      .map(normalizeTag)
      .filter(Boolean)
      .slice(0, 20);
    const suitable = result.data.suitable_for
      .map(normalizeTag)
      .filter(Boolean)
      .slice(0, 12);
    const colors = result.data.colors
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8);

    const existing = ((asset.tags as string[]) ?? []).map(normalizeTag);
    const mergedTags = Array.from(
      new Set([...existing, ...aiTags, ...suitable].filter(Boolean)),
    ).slice(0, 30);

    await supabase
      .from("media_assets")
      .update({
        description: result.data.description,
        ai_subject: result.data.subject,
        ai_style: result.data.style,
        ai_colors: colors,
        suitable_for: suitable,
        tags: mergedTags,
        ai_tagged_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", asset.id)
      .eq("organization_id", params.organizationId);

    await supabase
      .from("agent_runs")
      .update({
        status: "complete",
        progress: 100,
        model: result.model,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_pence: result.costPence,
        duration_ms: Date.now() - started,
        output: {
          mediaAssetId: asset.id,
          subject: result.data.subject,
          tagCount: mergedTags.length,
        },
      })
      .eq("id", params.agentRunId);

    return { ok: true };
  } catch (err) {
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        progress: 100,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - started,
      })
      .eq("id", params.agentRunId);
    throw err;
  }
}

export async function queueMediaVisionTag(params: {
  organizationId: string;
  brandId: string;
  mediaAssetId: string;
  userId?: string | null;
}): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: run } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: params.organizationId,
      module: "brand",
      agent_name: mediaTagPrompt.agentName,
      status: "queued",
      input: {
        brandId: params.brandId,
        mediaAssetId: params.mediaAssetId,
      },
      progress: 0,
      metered: false,
    })
    .select("id")
    .single();
  if (!run) return null;

  const { inngest } = await import("@/lib/inngest/client");
  await inngest.send({
    name: "brand/media.tag",
    data: {
      organizationId: params.organizationId,
      brandId: params.brandId,
      mediaAssetId: params.mediaAssetId,
      agentRunId: run.id,
      userId: params.userId ?? undefined,
    },
  });

  return run.id;
}
