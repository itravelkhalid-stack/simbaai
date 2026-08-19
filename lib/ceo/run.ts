import { runClaudeJson } from "@/lib/agents/claude-json";
import { ceoDailyPrompt, ceoWeeklyPrompt } from "@/lib/agents/prompts/ceo/daily";
import { runDeterministicCeoChecks } from "@/lib/ceo/checks";
import {
  ceoJudgmentSchema,
  ceoWeeklySchema,
  type CeoCheckSnapshot,
} from "@/lib/ceo/types";
import { withAgentRun } from "@/lib/agents/run-lifecycle";
import { createAdminClient } from "@/lib/supabase/admin";

function buildAccountabilityMarkdown(input: {
  brandName: string;
  checkedAt: string;
  departments: CeoCheckSnapshot["departments"];
  actions: CeoCheckSnapshot["actions_taken"];
  hires: CeoCheckSnapshot["hire_proposals"];
  kpi: CeoCheckSnapshot["kpi_summary"];
  judgmentSummary: string;
  priorities: string[];
  humanAsks: string[];
}) {
  const deptLines = input.departments
    .map((d) => {
      const findings =
        d.findings.length > 0
          ? d.findings.map((f) => `  - [${f.severity}] ${f.message}`).join("\n")
          : "  - No issues";
      return `- **${d.department}**: ${d.status}\n${findings}`;
    })
    .join("\n");
  const actions =
    input.actions.length > 0
      ? input.actions.map((a) => `- ${a.type}: ${a.detail}`).join("\n")
      : "- None this cycle";
  const hires =
    input.hires.length > 0
      ? input.hires
          .map(
            (h) =>
              `- ${h.display_name} (${h.status}): ${h.mandate} — ${h.reason}`,
          )
          .join("\n")
      : "- None";
  const wow = input.kpi.week_over_week ?? {};
  return `## CEO accountability — ${input.brandName}
Checked at ${input.checkedAt}

### Department status
${deptLines}

### What the CEO did
${actions}

### Hiring (registry activation)
${hires}

### Week-over-week
- Ad spend Δ: ${wow.ad_spend_pence_delta_pct ?? "n/a"}%
- This week spend (pence): ${wow.ad_spend_pence_this_week ?? "n/a"}
- Prior week spend (pence): ${wow.ad_spend_pence_prev_week ?? "n/a"}

### CEO judgment
${input.judgmentSummary}

### Priorities today
${input.priorities.length ? input.priorities.map((p) => `- ${p}`).join("\n") : "- None"}

### Needs from human
${input.humanAsks.length ? input.humanAsks.map((p) => `- ${p}`).join("\n") : "- Ideally nothing but budget / approvals"}
`;
}

export async function runCeoCheckForBrand(params: {
  organizationId: string;
  brandId: string;
  weekly?: boolean;
}): Promise<{ checkId: string; overall_status: string }> {
  const supabase = createAdminClient();
  const { data: brand } = await supabase
    .from("brands")
    .select("id, name")
    .eq("id", params.brandId)
    .eq("organization_id", params.organizationId)
    .single();
  if (!brand) throw new Error("Brand not found");

  const { skipIfBrandAgentHalted } = await import("@/lib/brand/agent-halt");
  const halt = await skipIfBrandAgentHalted({
    organizationId: params.organizationId,
    brandId: params.brandId,
  });
  if (halt) {
    throw new Error(halt.message);
  }

  const { data: last } = await supabase
    .from("ceo_checks")
    .select("checked_at")
    .eq("brand_id", params.brandId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const until = new Date();
  const since = last?.checked_at
    ? new Date(last.checked_at)
    : new Date(until.getTime() - 24 * 60 * 60 * 1000);

  const { data: result, agentRunId } = await withAgentRun({
    organizationId: params.organizationId,
    module: "executive",
    agentName: "chief_executive",
    input: {
      brandId: params.brandId,
      since: since.toISOString(),
      weekly: Boolean(params.weekly),
    },
    work: async () => {
      const deterministic = await runDeterministicCeoChecks({
        organizationId: params.organizationId,
        brandId: params.brandId,
        since,
        until,
      });

      const judgment = await runClaudeJson({
        system: ceoDailyPrompt.system,
        user: ceoDailyPrompt.buildUserPrompt({
          brandName: brand.name,
          departments: deterministic.departments,
          actionsTaken: deterministic.actions_taken,
          hireProposals: deterministic.hire_proposals,
          kpiSummary: deterministic.kpi_summary,
          overallStatus: deterministic.overall_status,
        }),
        schema: ceoJudgmentSchema,
        maxTokens: 2000,
      });

      let stateOfCompany: string | null = null;
      let weeklyPayload: Record<string, unknown> | null = null;
      if (params.weekly) {
        const weekly = await runClaudeJson({
          system: ceoWeeklyPrompt.system,
          user: ceoWeeklyPrompt.buildUserPrompt({
            brandName: brand.name,
            departments: deterministic.departments,
            actionsTaken: deterministic.actions_taken,
            hireProposals: deterministic.hire_proposals,
            kpiSummary: deterministic.kpi_summary,
            judgment: judgment.data,
          }),
          schema: ceoWeeklySchema,
          maxTokens: 3000,
        });
        stateOfCompany = weekly.data.state_of_company_markdown;
        weeklyPayload = weekly.data;
      }

      const overall =
        judgment.data.overall_status === "failing" ||
        deterministic.overall_status === "failing"
          ? "failing"
          : judgment.data.overall_status === "behind" ||
              deterministic.overall_status === "behind"
            ? "behind"
            : "ok";

      const accountability_markdown = buildAccountabilityMarkdown({
        brandName: brand.name,
        checkedAt: until.toISOString(),
        departments: deterministic.departments,
        actions: deterministic.actions_taken,
        hires: deterministic.hire_proposals,
        kpi: deterministic.kpi_summary,
        judgmentSummary: judgment.data.summary,
        priorities: judgment.data.priorities_today,
        humanAsks: judgment.data.human_asks,
      });

      const { data: row, error } = await supabase
        .from("ceo_checks")
        .insert({
          organization_id: params.organizationId,
          brand_id: params.brandId,
          checked_at: until.toISOString(),
          period_start: since.toISOString(),
          period_end: until.toISOString(),
          departments: deterministic.departments,
          kpi_summary: deterministic.kpi_summary,
          actions_taken: deterministic.actions_taken,
          hire_proposals: deterministic.hire_proposals,
          ai_judgment: {
            ...judgment.data,
            weekly: weeklyPayload,
          },
          accountability_markdown,
          state_of_company_markdown: stateOfCompany,
          overall_status: overall,
        })
        .select("id")
        .single();
      if (error || !row) throw new Error(error?.message ?? "ceo_checks insert failed");

      if (deterministic.hire_proposals.length) {
        await supabase
          .from("brand_agent_activations")
          .update({ ceo_check_id: row.id })
          .eq("brand_id", params.brandId)
          .eq("proposed_by", "ceo")
          .is("ceo_check_id", null)
          .in(
            "agent_id",
            deterministic.hire_proposals.map((h) => h.agent_id),
          );
      }

      return {
        data: { checkId: row.id, overall_status: overall },
        model: judgment.model,
        tokensIn: judgment.tokensIn,
        tokensOut: judgment.tokensOut,
        costPence: judgment.costPence,
        output: { checkId: row.id, overall },
      };
    },
  });

  await supabase
    .from("ceo_checks")
    .update({ agent_run_id: agentRunId })
    .eq("id", result.checkId);

  return result;
}

export async function runCeoChecksForAllBrands(params?: { weekly?: boolean }) {
  const supabase = createAdminClient();
  const { data: brands } = await supabase
    .from("brands")
    .select("id, organization_id, agent_activity_paused")
    .eq("agent_activity_paused", false)
    .limit(200);

  const results = [];
  for (const b of brands ?? []) {
    try {
      results.push({
        brandId: b.id,
        ...(await runCeoCheckForBrand({
          organizationId: b.organization_id,
          brandId: b.id,
          weekly: params?.weekly,
        })),
      });
    } catch (err) {
      results.push({
        brandId: b.id,
        error: err instanceof Error ? err.message : "failed",
      });
    }
  }
  return results;
}

export async function getLatestCeoCheck(params: {
  organizationId: string;
  brandId: string;
}) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("ceo_checks")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
