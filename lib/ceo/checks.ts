import "server-only";

import { resolveContentCadence, formatBucket } from "@/lib/content/cadence";
import { getBrandEnabledContentPlatforms } from "@/lib/brand/channels";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CeoActionTaken,
  CeoDepartmentResult,
  CeoFinding,
  CeoHireProposal,
} from "@/lib/ceo/types";
import {
  isRegistryAgentActiveForBrand,
  proposeOrActivateHire,
} from "@/lib/ceo/hiring";
import { effectiveAutonomyMode, parseBrandAutonomy } from "@/lib/autonomy/settings";
import type { Brand } from "@/lib/types/research";

function worstStatus(
  statuses: Array<CeoDepartmentResult["status"]>,
): "ok" | "behind" | "failing" {
  if (statuses.includes("failing")) return "failing";
  if (statuses.includes("behind") || statuses.includes("idle")) return "behind";
  return "ok";
}

function deptStatusFromFindings(
  findings: CeoFinding[],
): CeoDepartmentResult["status"] {
  if (findings.some((f) => f.severity === "critical")) return "failing";
  if (findings.some((f) => f.severity === "warning")) return "behind";
  return "delivered";
}

export async function runDeterministicCeoChecks(params: {
  organizationId: string;
  brandId: string;
  since: Date;
  until: Date;
}): Promise<{
  departments: CeoDepartmentResult[];
  actions_taken: CeoActionTaken[];
  hire_proposals: CeoHireProposal[];
  kpi_summary: { week_over_week: Record<string, number | null>; notes: string[] };
  overall_status: "ok" | "behind" | "failing";
}> {
  const supabase = createAdminClient();
  const { organizationId, brandId, since, until } = params;
  const departments: CeoDepartmentResult[] = [];
  const actions_taken: CeoActionTaken[] = [];
  const hire_proposals: CeoHireProposal[] = [];
  const notes: string[] = [];

  const { data: brand } = await supabase
    .from("brands")
    .select("*")
    .eq("id", brandId)
    .eq("organization_id", organizationId)
    .single();
  if (!brand) throw new Error("Brand not found");
  const brandRow = brand as Brand & { content_cadence?: unknown };
  const autonomy = parseBrandAutonomy(brandRow);
  const mode = effectiveAutonomyMode(autonomy, "content");

  // ── Content / cadence ────────────────────────────────────────────────────
  {
    const findings: CeoFinding[] = [];
    const enabled = await getBrandEnabledContentPlatforms({
      organizationId,
      brandId,
      admin: true,
    });
    const targets = resolveContentCadence(brandRow.content_cadence, enabled);
    const horizonStart = new Date();
    horizonStart.setUTCHours(0, 0, 0, 0);
    const horizonEnd = new Date(horizonStart);
    horizonEnd.setUTCDate(horizonEnd.getUTCDate() + 7);

    const { data: items } = await supabase
      .from("content_items")
      .select("platform, format, scheduled_at, status")
      .eq("organization_id", organizationId)
      .eq("brand_id", brandId)
      .not("status", "eq", "rejected")
      .gte("scheduled_at", horizonStart.toISOString())
      .lt("scheduled_at", horizonEnd.toISOString())
      .limit(2000);

    const counts = new Map<string, number>();
    for (const item of items ?? []) {
      if (!item.scheduled_at) continue;
      const date = item.scheduled_at.slice(0, 10);
      const kind = formatBucket(item.format as "story" | "post");
      const key = `${date}|${item.platform}|${kind}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    let needed = 0;
    let have = 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(horizonStart);
      day.setUTCDate(day.getUTCDate() + d);
      const date = day.toISOString().slice(0, 10);
      for (const t of targets) {
        needed += t.perDay;
        have += Math.min(
          t.perDay,
          counts.get(`${date}|${t.platform}|${t.kind}`) ?? 0,
        );
      }
    }
    const coverage = needed > 0 ? have / needed : 1;
    if (coverage < 0.85) {
      findings.push({
        code: "cadence_behind",
        severity: coverage < 0.5 ? "critical" : "warning",
        message: `Organic calendar ${Math.round(coverage * 100)}% covered for next 7 days (${have}/${needed} slots).`,
      });
      try {
        const { inngest } = await import("@/lib/inngest/client");
        await inngest.send({
          name: "content/cadence.fill",
          data: { organizationId, brandId },
        });
        actions_taken.push({
          type: "requeue_cadence_fill",
          detail: "Queued content cadence fill for this brand",
        });
      } catch (err) {
        findings.push({
          code: "cadence_requeue_failed",
          severity: "warning",
          message: err instanceof Error ? err.message : "Could not queue cadence fill",
        });
      }
    }

    const staleCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: staleApprovals } = await supabase
      .from("content_items")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("brand_id", brandId)
      .eq("status", "pending_approval")
      .lt("created_at", staleCutoff);
    if ((staleApprovals ?? 0) > 0) {
      findings.push({
        code: "stale_approvals",
        severity: "warning",
        message: `${staleApprovals} content approvals sitting unactioned >24h.`,
      });
    }

    departments.push({
      department: "content",
      status: findings.length ? deptStatusFromFindings(findings) : "delivered",
      findings,
    });
  }

  // ── Social publishing ────────────────────────────────────────────────────
  {
    const findings: CeoFinding[] = [];
    const { count: failed } = await supabase
      .from("content_items")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("brand_id", brandId)
      .eq("status", "publish_failed")
      .gte("updated_at", since.toISOString());
    if ((failed ?? 0) > 0) {
      findings.push({
        code: "publish_failures",
        severity: "critical",
        message: `${failed} publish failure(s) since last check.`,
      });
    }
    departments.push({
      department: "social",
      status: findings.length ? deptStatusFromFindings(findings) : "delivered",
      findings,
    });
  }

  // ── Advertising ──────────────────────────────────────────────────────────
  {
    const findings: CeoFinding[] = [];
    const { data: campaigns } = await supabase
      .from("ad_campaigns")
      .select("id, status, daily_budget_pence, name")
      .eq("organization_id", organizationId)
      .eq("brand_id", brandId)
      .limit(100);
      const live = (campaigns ?? []).filter((c) => c.status === "active");
    if (live.length === 0) {
      findings.push({
        code: "no_live_campaigns",
        severity: "info",
        message: "No live ad campaigns for this brand.",
      });
    } else {
      const today = new Date().toISOString().slice(0, 10);
      const { data: metrics } = await supabase
        .from("ad_metrics_daily")
        .select("campaign_id, spend_pence")
        .eq("organization_id", organizationId)
        .eq("metric_date", today)
        .in(
          "campaign_id",
          live.map((c) => c.id),
        );
      const spendByCampaign = new Map(
        (metrics ?? []).map((m) => [m.campaign_id, Number(m.spend_pence ?? 0)]),
      );
      for (const c of live) {
        const budget = Number(c.daily_budget_pence ?? 0);
        if (budget <= 0) continue;
        const spend = spendByCampaign.get(c.id) ?? 0;
        const pct = spend / budget;
        // Early morning spend is low — only flag late-day overspend or zero-budget chaos
        if (pct > 1.2) {
          findings.push({
            code: "budget_overpace",
            severity: "warning",
            message: `Campaign ${c.name ?? c.id} spent ${Math.round(pct * 100)}% of daily budget.`,
          });
        }
      }
    }

    const optActive = await isRegistryAgentActiveForBrand({
      organizationId,
      brandId,
      agentId: "ads-optimisation",
    });
    if (live.length > 0 && !optActive) {
      const hire = await proposeOrActivateHire({
        organizationId,
        brandId,
        agentId: "ads-optimisation",
        mandate: "Run daily paid optimisation within org ad limits.",
        reason: "Live campaigns without hired ads optimiser.",
        autonomyMode: effectiveAutonomyMode(autonomy, "ads"),
      });
      if (hire) hire_proposals.push(hire);
      findings.push({
        code: "ads_optimiser_gap",
        severity: "warning",
        message: "Live campaigns but ads optimiser not hired for this brand.",
      });
    }

    departments.push({
      department: "advertising",
      status:
        findings.some((f) => f.severity !== "info")
          ? deptStatusFromFindings(findings.filter((f) => f.severity !== "info"))
          : live.length
            ? "delivered"
            : "n/a",
      findings,
    });
  }

  // ── Email ────────────────────────────────────────────────────────────────
  {
    const findings: CeoFinding[] = [];
    const { data: emailKpis } = await supabase
      .from("brand_kpis")
      .select("metric_key")
      .eq("organization_id", organizationId)
      .eq("brand_id", brandId)
      .ilike("metric_key", "%email%");
    const { count: recentCampaigns } = await supabase
      .from("email_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("brand_id", brandId)
      .gte("created_at", since.toISOString());

    if ((emailKpis ?? []).length > 0 && (recentCampaigns ?? 0) === 0) {
      findings.push({
        code: "email_idle",
        severity: "warning",
        message: "Email KPI exists but no email campaigns created since last check.",
      });
      const emailActive = await isRegistryAgentActiveForBrand({
        organizationId,
        brandId,
        agentId: "email-campaign-generate",
      });
      if (!emailActive) {
        const hire = await proposeOrActivateHire({
          organizationId,
          brandId,
          agentId: "email-campaign-generate",
          mandate: "Generate email campaigns against the email KPI.",
          reason: "Email department idle while an email KPI is configured.",
          autonomyMode: effectiveAutonomyMode(autonomy, "email"),
        });
        if (hire) hire_proposals.push(hire);
      }
    }

    departments.push({
      department: "email",
      status: findings.length
        ? "idle"
        : (emailKpis ?? []).length
          ? "delivered"
          : "n/a",
      findings,
    });
  }

  // ── SEO ──────────────────────────────────────────────────────────────────
  {
    const findings: CeoFinding[] = [];
    const { data: projects } = await supabase
      .from("seo_projects")
      .select("id, gsc_connected, last_gsc_sync_at")
      .eq("organization_id", organizationId)
      .eq("brand_id", brandId)
      .limit(10);
    if (!(projects ?? []).length) {
      findings.push({
        code: "no_seo_project",
        severity: "info",
        message: "No SEO project for this brand.",
      });
    } else if ((projects ?? []).some((p) => p.gsc_connected)) {
      const stale = (projects ?? []).filter((p) => {
        if (!p.last_gsc_sync_at) return true;
        return new Date(p.last_gsc_sync_at).getTime() < since.getTime();
      });
      if (stale.length) {
        findings.push({
          code: "gsc_sync_stale",
          severity: "warning",
          message: "GSC connected but no successful sync since last CEO check.",
        });
      }
    }
    departments.push({
      department: "seo",
      status: findings.some((f) => f.severity === "warning")
        ? "behind"
        : findings.some((f) => f.severity === "info")
          ? "n/a"
          : "delivered",
      findings,
    });
  }

  // ── Analytics / GA4 revenue ──────────────────────────────────────────────
  {
    const findings: CeoFinding[] = [];
    const { data: ga4 } = await supabase
      .from("ga4_connections")
      .select(
        "status, property_id, conversion_event_names, discovered_event_names",
      )
      .eq("organization_id", organizationId)
      .eq("brand_id", brandId)
      .maybeSingle();
    if (!ga4?.property_id) {
      findings.push({
        code: "ga4_not_connected",
        severity: "info",
        message: "GA4 not connected.",
      });
    } else {
      const { hasGa4RevenueTracking } = await import(
        "@/lib/data/ga4-conversion-events"
      );
      if (
        !hasGa4RevenueTracking({
          conversionEventNames: ga4.conversion_event_names,
          discoveredEventNames: ga4.discovered_event_names,
        })
      ) {
        findings.push({
          code: "ga4_revenue_missing",
          severity: "warning",
          message:
            "GA4 purchase/revenue tracking not configured — intent proxies only.",
        });
      }
    }
    departments.push({
      department: "analytics",
      status: findings.some((f) => f.severity === "warning")
        ? "behind"
        : "delivered",
      findings,
    });
  }

  // ── Operations / agent_runs ──────────────────────────────────────────────
  {
    const findings: CeoFinding[] = [];
    const { data: runs } = await supabase
      .from("agent_runs")
      .select("id, agent_name, status, error, created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", since.toISOString())
      .lte("created_at", until.toISOString())
      .limit(200);
    const failed = (runs ?? []).filter((r) => r.status === "failed");
    if (failed.length > 0) {
      findings.push({
        code: "failed_agent_runs",
        severity: failed.length >= 3 ? "critical" : "warning",
        message: `${failed.length} agent run(s) failed since last check.`,
      });
      // Re-queue cadence fill failures only (safe/idempotent).
      for (const r of failed.slice(0, 5)) {
        if (r.agent_name === "content_cadence_fill") {
          try {
            const { inngest } = await import("@/lib/inngest/client");
            await inngest.send({
              name: "content/cadence.fill",
              data: { organizationId, brandId },
            });
            actions_taken.push({
              type: "requeue_failed_job",
              detail: `Re-queued content cadence fill after failed run ${r.id}`,
              entity_id: r.id,
            });
          } catch {
            /* ignore */
          }
        }
      }
    }
    departments.push({
      department: "operations",
      status: findings.length ? deptStatusFromFindings(findings) : "delivered",
      findings,
    });
  }

  // KPI week-over-week (spend / sessions light)
  const weekAgo = new Date(until);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const twoWeeks = new Date(until);
  twoWeeks.setUTCDate(twoWeeks.getUTCDate() - 14);

  const sumSpend = async (from: Date, to: Date) => {
    const { data } = await supabase
      .from("ad_metrics_daily")
      .select("spend_pence, campaign_id")
      .eq("organization_id", organizationId)
      .gte("metric_date", from.toISOString().slice(0, 10))
      .lt("metric_date", to.toISOString().slice(0, 10));
    const { data: camps } = await supabase
      .from("ad_campaigns")
      .select("id")
      .eq("brand_id", brandId);
    const ids = new Set((camps ?? []).map((c) => c.id));
    return (data ?? [])
      .filter((r) => ids.has(r.campaign_id))
      .reduce((s, r) => s + Number(r.spend_pence ?? 0), 0);
  };

  const spendThis = await sumSpend(weekAgo, until);
  const spendPrev = await sumSpend(twoWeeks, weekAgo);
  const wowSpend =
    spendPrev > 0 ? (spendThis - spendPrev) / spendPrev : spendThis > 0 ? 1 : 0;

  if (mode === "approval") {
    notes.push("Brand is in approval mode — CEO remediations queue for humans where required.");
  }

  const overall_status = worstStatus(departments.map((d) => d.status));

  return {
    departments,
    actions_taken,
    hire_proposals,
    kpi_summary: {
      week_over_week: {
        ad_spend_pence_delta_pct: Math.round(wowSpend * 1000) / 10,
        ad_spend_pence_this_week: spendThis,
        ad_spend_pence_prev_week: spendPrev,
      },
      notes,
    },
    overall_status,
  };
}
