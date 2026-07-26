import { createAdminClient } from "@/lib/supabase/admin";
import { runClaudeJson } from "@/lib/agents/claude-json";
import {
  BRAND_EXTRACTION_PROMPT_VERSION,
  brandExtractionSystemPrompt,
  brandExtractionUserPrompt,
} from "@/lib/agents/prompts/brand/extraction";
import { brandExtractionResultSchema } from "@/lib/validations/brand";

async function fetchWebsiteText(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": "SimbaAIBrandBot/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Failed to fetch website (${res.status})`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function extractBrandFromWebsite(params: {
  organizationId: string;
  brandId: string;
  websiteUrl: string;
  userId?: string | null;
}) {
  const supabase = createAdminClient();
  const started = Date.now();

  const { data: run, error: runError } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: params.organizationId,
      module: "brand",
      agent_name: "brand_extraction",
      status: "running",
      input: {
        websiteUrl: params.websiteUrl,
        brandId: params.brandId,
        prompt_version: BRAND_EXTRACTION_PROMPT_VERSION,
      },
      progress: 10,
    })
    .select("id")
    .single();
  if (runError || !run) throw new Error(runError?.message ?? "Failed to start agent run");

  try {
    const pageText = await fetchWebsiteText(params.websiteUrl);
    const generated = await runClaudeJson({
      system: brandExtractionSystemPrompt(),
      user: brandExtractionUserPrompt(params.websiteUrl, pageText),
      schema: brandExtractionResultSchema,
      webSearch: true,
      maxTokens: 4096,
    });

    const g = generated.data;
    const { data: existing } = await supabase
      .from("brands")
      .select("guidelines")
      .eq("id", params.brandId)
      .single();

    const guidelines = {
      ...((existing?.guidelines as Record<string, unknown>) ?? {}),
      tone: g.guidelines.tone ?? null,
      do_say: g.guidelines.do_say,
      dont_say: g.guidelines.dont_say,
      value_props: g.guidelines.value_props,
      last_extraction_url: params.websiteUrl,
      last_extraction_at: new Date().toISOString(),
    };

    await supabase
      .from("brands")
      .update({
        name: g.name,
        website: params.websiteUrl,
        tagline: g.tagline ?? null,
        positioning: g.positioning ?? null,
        brand_voice: g.brand_voice ?? null,
        target_audience: g.target_audience ?? null,
        primary_color: g.primary_color ?? null,
        secondary_color: g.secondary_color ?? null,
        accent_color: g.accent_color ?? null,
        font_heading: g.font_heading ?? null,
        font_body: g.font_body ?? null,
        guidelines,
      })
      .eq("id", params.brandId)
      .eq("organization_id", params.organizationId);

    if (g.audiences.length) {
      await supabase.from("brand_audiences").delete().eq("brand_id", params.brandId);
      await supabase.from("brand_audiences").insert(
        g.audiences.map((a) => ({
          organization_id: params.organizationId,
          brand_id: params.brandId,
          name: a.name,
          description: a.description ?? null,
          messaging_angles: a.messaging_angles ?? [],
        })),
      );
    }

    if (g.products.length) {
      await supabase.from("brand_products").delete().eq("brand_id", params.brandId);
      await supabase.from("brand_products").insert(
        g.products.map((p, i) => ({
          organization_id: params.organizationId,
          brand_id: params.brandId,
          name: p.name,
          description: p.description ?? null,
          category: p.category ?? null,
          sort_order: i,
        })),
      );
    }

    await supabase
      .from("agent_runs")
      .update({
        status: "complete",
        output: g as unknown as Record<string, unknown>,
        tokens_in: generated.tokensIn,
        tokens_out: generated.tokensOut,
        cost_pence: generated.costPence,
        model: generated.model,
        duration_ms: Date.now() - started,
        progress: 100,
      })
      .eq("id", run.id);

    return { runId: run.id, data: g };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Brand extraction failed";
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        error: message,
        progress: 100,
        duration_ms: Date.now() - started,
      })
      .eq("id", run.id);
    throw error;
  }
}
