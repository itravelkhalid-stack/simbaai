import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { runClaudeJsonWithDocument } from "@/lib/agents/claude-document";
import {
  BRAND_GUIDELINES_PDF_PROMPT_VERSION,
  brandGuidelinesPdfSystemPrompt,
  brandGuidelinesPdfUserPrompt,
} from "@/lib/agents/prompts/brand/guidelines-pdf";
import { appendAgentRunLog } from "@/lib/agents/research/persist";
import { downloadBrandMediaBytes } from "@/lib/media/storage";
import { guidelinesPdfExtractionSchema } from "@/lib/validations/media";

export async function extractGuidelinesFromPdfAsset(params: {
  organizationId: string;
  brandId: string;
  mediaAssetId: string;
  userId?: string | null;
  agentRunId?: string;
}) {
  const { assertBrandAgentsActive } = await import("@/lib/brand/agent-halt");
  await assertBrandAgentsActive({
    organizationId: params.organizationId,
    brandId: params.brandId,
  });

  const supabase = createAdminClient();

  const { data: asset, error: assetError } = await supabase
    .from("media_assets")
    .select("*")
    .eq("id", params.mediaAssetId)
    .eq("organization_id", params.organizationId)
    .single();
  if (assetError || !asset) {
    throw new Error(assetError?.message ?? "Media asset not found");
  }
  if (asset.type !== "document") {
    throw new Error("Guidelines ingestion requires a PDF document asset");
  }

  let runId = params.agentRunId;
  if (!runId) {
    const { data: run, error: runError } = await supabase
      .from("agent_runs")
      .insert({
        organization_id: params.organizationId,
        module: "brand",
        agent_name: "brand_guidelines_pdf",
        status: "running",
        input: {
          brandId: params.brandId,
          mediaAssetId: params.mediaAssetId,
          prompt_version: BRAND_GUIDELINES_PDF_PROMPT_VERSION,
        },
        progress: 5,
      })
      .select("id")
      .single();
    if (runError || !run) {
      throw new Error(runError?.message ?? "Failed to start agent run");
    }
    runId = run.id;
  }

  const started = Date.now();
  try {
    await appendAgentRunLog(runId, "Downloading guidelines PDF", 15);
    const { bytes } = await downloadBrandMediaBytes(asset.storage_path);
    const base64 = bytes.toString("base64");

    await appendAgentRunLog(runId, "Extracting structured guidelines", 40);
    const generated = await runClaudeJsonWithDocument({
      system: brandGuidelinesPdfSystemPrompt(),
      user: brandGuidelinesPdfUserPrompt(asset.filename),
      schema: guidelinesPdfExtractionSchema,
      documentBase64: base64,
      maxTokens: 4096,
    });

    const { data: brand } = await supabase
      .from("brands")
      .select(
        "guidelines, brand_voice, primary_color, secondary_color, accent_color, font_heading, font_body",
      )
      .eq("id", params.brandId)
      .eq("organization_id", params.organizationId)
      .single();

    const currentSnapshot = {
      brand_voice: brand?.brand_voice ?? null,
      primary_color: brand?.primary_color ?? null,
      secondary_color: brand?.secondary_color ?? null,
      accent_color: brand?.accent_color ?? null,
      font_heading: brand?.font_heading ?? null,
      font_body: brand?.font_body ?? null,
      guidelines: (brand?.guidelines as Record<string, unknown>) ?? {},
    };

    const g = generated.data;
    const proposed = {
      brand_voice: g.brand_voice ?? currentSnapshot.brand_voice,
      primary_color: g.primary_color ?? currentSnapshot.primary_color,
      secondary_color: g.secondary_color ?? currentSnapshot.secondary_color,
      accent_color: g.accent_color ?? currentSnapshot.accent_color,
      font_heading: g.font_heading ?? currentSnapshot.font_heading,
      font_body: g.font_body ?? currentSnapshot.font_body,
      guidelines: {
        ...((currentSnapshot.guidelines as Record<string, unknown>) ?? {}),
        tone: g.guidelines.tone ?? null,
        do_say: g.guidelines.do_say,
        dont_say: g.guidelines.dont_say,
        value_props: g.guidelines.value_props,
        vocabulary: g.guidelines.vocabulary,
        summary: g.guidelines.summary ?? null,
        last_pdf_asset_id: params.mediaAssetId,
        last_pdf_extraction_at: new Date().toISOString(),
      },
    };

    const summary =
      g.guidelines.summary ||
      `Extracted ${g.guidelines.do_say.length} do-say, ${g.guidelines.dont_say.length} don't-say, ${g.guidelines.value_props.length} value props from ${asset.filename}`;

    // Never overwrite — store as a pending proposal for human approval
    const { data: proposal, error: propError } = await supabase
      .from("brand_guidelines_proposals")
      .insert({
        organization_id: params.organizationId,
        brand_id: params.brandId,
        media_asset_id: params.mediaAssetId,
        agent_run_id: runId,
        status: "pending",
        proposed,
        current_snapshot: currentSnapshot,
        summary,
        created_by: params.userId ?? null,
      })
      .select("id")
      .single();
    if (propError || !proposal) {
      throw new Error(propError?.message ?? "Failed to save proposal");
    }

    await supabase
      .from("agent_runs")
      .update({
        status: "complete",
        progress: 100,
        output: { proposalId: proposal.id, summary },
        model: generated.model,
        tokens_in: generated.tokensIn,
        tokens_out: generated.tokensOut,
        cost_pence: generated.costPence,
        duration_ms: Date.now() - started,
      })
      .eq("id", runId);

    return { proposalId: proposal.id, agentRunId: runId };
  } catch (error) {
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        error: error instanceof Error ? error.message : "Extraction failed",
        duration_ms: Date.now() - started,
      })
      .eq("id", runId);
    throw error;
  }
}
