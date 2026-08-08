import "server-only";

import { z } from "zod";
import { runClaudeJson } from "@/lib/agents/claude-json";
import {
  MARMARIS_SEASONALITY_SEED,
  type VisitAttractiveness,
} from "@/lib/ads/booking-window";
import { upsertSeasonalityRows } from "@/lib/ads/seasonality";
import { createAdminClient } from "@/lib/supabase/admin";

const seasonalityAgentSchema = z.object({
  destinations: z
    .array(
      z.object({
        destination_slug: z.string(),
        destination_name: z.string(),
        months: z
          .array(
            z.object({
              stay_month: z.number().int().min(1).max(12),
              visit_attractiveness: z.enum(["peak", "shoulder", "off"]),
              booking_lead_min_days: z.number().int().min(0).max(400),
              booking_lead_max_days: z.number().int().min(0).max(400),
              notes: z.string().optional().default(""),
              evidence: z.array(z.string()).default([]),
            }),
          )
          .min(12)
          .max(12),
      }),
    )
    .min(1),
});

/**
 * Research / refresh destination seasonality for a brand.
 * Seeds known destinations when empty; Claude refreshes monthly rows.
 */
export async function runDestinationSeasonalityResearch(params: {
  organizationId: string;
  brandId: string;
  destinations?: string[];
}) {
  const supabase = createAdminClient();
  const { data: brand } = await supabase
    .from("brands")
    .select("name, website, positioning")
    .eq("id", params.brandId)
    .single();

  const destinations =
    params.destinations?.length
      ? params.destinations
      : ["dubai", "marmaris", "antalya", "istanbul"];

  const { data: run } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: params.organizationId,
      module: "ads",
      agent_name: "ads_seasonality_research",
      status: "running",
      progress: 10,
      input: { brandId: params.brandId, destinations },
    })
    .select("id")
    .single();

  try {
    // Always ensure Marmaris seed exists for booking-window regression coverage
    await upsertSeasonalityRows({
      organizationId: params.organizationId,
      brandId: params.brandId,
      rows: MARMARIS_SEASONALITY_SEED.map((r) => ({
        ...r,
        source: "seed" as const,
        notes: r.notes ?? "Seeded beach-season defaults",
      })),
    });

    const generated = await runClaudeJson({
      system: `You are a travel demand research analyst for a hotel booking brand.
Return JSON only matching the schema. For each destination, provide ALL 12 calendar months.
visit_attractiveness: peak | shoulder | off for *visiting* that destination that month.
booking_lead_*_days: typical window before stay-month start when guests book (e.g. summer beach 90–180; city breaks 14–60).
Cite concise evidence strings (search trends, climate, holiday calendars).`,
      user: `Brand: ${brand?.name ?? "unknown"}
Website: ${brand?.website ?? "n/a"}
Destinations to research: ${destinations.join(", ")}

Produce seasonality + booking lead times that a paid-media planner can use.
Do not invent fake URLs — describe evidence as short statements.`,
      schema: seasonalityAgentSchema,
      webSearch: true,
      maxTokens: 8192,
    });

    const rows = generated.data.destinations.flatMap((d) =>
      d.months.map((m) => ({
        destination_slug: d.destination_slug.toLowerCase().replace(/\s+/g, "-"),
        destination_name: d.destination_name,
        stay_month: m.stay_month,
        visit_attractiveness: m.visit_attractiveness as VisitAttractiveness,
        booking_lead_min_days: m.booking_lead_min_days,
        booking_lead_max_days: Math.max(
          m.booking_lead_max_days,
          m.booking_lead_min_days,
        ),
        notes: m.notes,
        evidence: m.evidence,
        source: "research_agent" as const,
      })),
    );

    await upsertSeasonalityRows({
      organizationId: params.organizationId,
      brandId: params.brandId,
      rows,
    });

    if (run) {
      await supabase
        .from("agent_runs")
        .update({
          status: "complete",
          progress: 100,
          model: generated.model,
          tokens_in: generated.tokensIn,
          tokens_out: generated.tokensOut,
          cost_pence: generated.costPence,
          output: { destinations: generated.data.destinations.length, rows: rows.length },
        })
        .eq("id", run.id);
    }

    return { ok: true as const, rows: rows.length, agentRunId: run?.id ?? null };
  } catch (err) {
    if (run) {
      await supabase
        .from("agent_runs")
        .update({
          status: "failed",
          error: err instanceof Error ? err.message : "seasonality research failed",
          progress: 100,
        })
        .eq("id", run.id);
    }
    throw err;
  }
}
