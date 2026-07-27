import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandContext } from "@/lib/brand/context";
import { generatePipelineReview } from "@/lib/agents/crm/generate";
import { ensureDefaultPipeline } from "@/lib/crm/contacts";
import type { CrmDeal } from "@/lib/types/crm";

function mondayOf(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  if (day !== 1) x.setUTCDate(x.getUTCDate() - (day - 1));
  return x.toISOString().slice(0, 10);
}

export async function runWeeklyPipelineReviews() {
  const supabase = createAdminClient();
  const weekStart = mondayOf();
  const { data: brands } = await supabase.from("brands").select("id, organization_id");
  const results: Array<{ brandId: string; reviewId: string }> = [];

  for (const brand of brands ?? []) {
    await ensureDefaultPipeline(brand.organization_id, brand.id);

    const { data: existing } = await supabase
      .from("crm_pipeline_reviews")
      .select("id")
      .eq("brand_id", brand.id)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (existing) continue;

    const { data: deals } = await supabase
      .from("crm_deals")
      .select("*")
      .eq("brand_id", brand.id)
      .is("won_at", null)
      .is("lost_at", null)
      .limit(80);

    if (!(deals ?? []).length) continue;

    const contactIds = [...new Set((deals ?? []).map((d) => d.contact_id))];
    const { data: contacts } = await supabase
      .from("crm_contacts")
      .select("id, email, name")
      .in("id", contactIds);
    const contactById = new Map(
      (contacts ?? []).map((c) => [c.id, c] as const),
    );

    const enriched = ((deals ?? []) as CrmDeal[]).map((deal) => {
      const contact = contactById.get(deal.contact_id);
      const updated = new Date(deal.updated_at).getTime();
      const days = Math.floor((Date.now() - updated) / 86400000);
      return {
        ...deal,
        contact_email: contact?.email,
        contact_name: contact?.name,
        days_in_stage: days,
      };
    });

    const brandContext = await getBrandContext(brand.organization_id, brand.id, {
      admin: true,
    });

    const { data: agentRun } = await supabase
      .from("agent_runs")
      .insert({
        organization_id: brand.organization_id,
        module: "crm",
        agent_name: "pipeline_review",
        status: "running",
        input: { brand_id: brand.id, week_start: weekStart },
        progress: 10,
      metered: false,
    })
    .select("id")
    .single();

  try {
      const generated = await generatePipelineReview({
        brandContext,
        deals: enriched,
        weekStart,
      });

      const { data: review, error } = await supabase
        .from("crm_pipeline_reviews")
        .insert({
          organization_id: brand.organization_id,
          brand_id: brand.id,
          week_start: weekStart,
          summary_markdown: generated.data.summary_markdown,
          stalled_deal_ids: generated.data.stalled_deal_ids,
          next_actions: generated.data.next_actions,
          agent_run_id: agentRun?.id ?? null,
        })
        .select("id")
        .single();

      if (error || !review) throw new Error(error?.message ?? "Review insert failed");

      // Mark stalled deals
      if (generated.data.stalled_deal_ids.length) {
        await supabase
          .from("crm_deals")
          .update({ stalled_since: new Date().toISOString() })
          .in("id", generated.data.stalled_deal_ids);
      }

      if (agentRun?.id) {
        await supabase
          .from("agent_runs")
          .update({
            status: "complete",
            output: {
              stalled: generated.data.stalled_deal_ids.length,
              actions: generated.data.next_actions.length,
            },
            tokens_in: generated.tokensIn,
            tokens_out: generated.tokensOut,
            cost_pence: generated.costPence,
            progress: 100,
          })
          .eq("id", agentRun.id);
      }

      results.push({ brandId: brand.id, reviewId: review.id });
    } catch (err) {
      if (agentRun?.id) {
        await supabase
          .from("agent_runs")
          .update({
            status: "failed",
            error: err instanceof Error ? err.message : "failed",
            progress: 100,
          })
          .eq("id", agentRun.id);
      }
    }
  }

  return { weekStart, results };
}
