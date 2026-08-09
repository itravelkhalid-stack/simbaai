import "server-only";

import { writeAuditEvent } from "@/lib/compliance/audit";
import { adsTable } from "@/lib/ads/db";
import { createAdminClient } from "@/lib/supabase/admin";

export const LAUNCH_REVIEW_DEPARTMENTS = [
  "compliance",
  "finance",
  "brand",
  "research",
  "qa",
] as const;

export type LaunchReviewDepartment = (typeof LAUNCH_REVIEW_DEPARTMENTS)[number];

type SignoffFinding = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
};

/**
 * Create (or reset) a launch review board for a campaign with 5 pending sign-offs.
 */
export async function ensureLaunchReview(params: {
  organizationId: string;
  brandId: string;
  campaignId: string;
}): Promise<string> {
  const supabase = createAdminClient();
  const { data: existing } = await adsTable(supabase, "ad_launch_reviews")
    .select("id")
    .eq("campaign_id", params.campaignId)
    .maybeSingle();

  let reviewId =
    existing && typeof existing.id === "string" ? existing.id : null;
  if (!reviewId) {
    const { data, error } = await adsTable(supabase, "ad_launch_reviews")
      .insert({
        organization_id: params.organizationId,
        brand_id: params.brandId,
        campaign_id: params.campaignId,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (!data?.id || typeof data.id !== "string") {
      throw new Error("Failed to create launch review");
    }
    reviewId = data.id;
    await supabase
      .from("ad_campaigns")
      .update({ launch_review_id: reviewId })
      .eq("id", params.campaignId);
  } else {
    // Re-run resets department checks; require a fresh CMO approval afterward.
    await adsTable(supabase, "ad_launch_reviews")
      .update({
        status: "pending",
        all_passed: false,
        cmo_approved_at: null,
        cmo_approved_by: null,
        cmo_note: null,
        cmo_agent_run_id: null,
      })
      .eq("id", reviewId)
      .eq("organization_id", params.organizationId);
  }

  for (const department of LAUNCH_REVIEW_DEPARTMENTS) {
    await adsTable(supabase, "ad_launch_review_signoffs").upsert(
      {
        organization_id: params.organizationId,
        review_id: reviewId,
        department,
        result: "pending",
        notes: null,
        findings: [],
      },
      { onConflict: "review_id,department" },
    );
  }

  return reviewId;
}

export async function recordLaunchSignoff(params: {
  organizationId: string;
  reviewId: string;
  department: LaunchReviewDepartment;
  result: "pass" | "fail";
  notes: string;
  findings?: SignoffFinding[];
  agentName: string;
  agentRunId?: string | null;
  actorUserId?: string | null;
}) {
  const supabase = createAdminClient();
  const { error } = await adsTable(supabase, "ad_launch_review_signoffs")
    .update({
      result: params.result,
      notes: params.notes,
      findings: params.findings ?? [],
      agent_name: params.agentName,
      agent_run_id: params.agentRunId ?? null,
      signed_at: new Date().toISOString(),
    })
    .eq("review_id", params.reviewId)
    .eq("department", params.department)
    .eq("organization_id", params.organizationId);
  if (error) throw new Error(error.message);

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId ?? null,
    action: "ad_launch_signoff",
    entityType: "ad_launch_review",
    entityId: params.reviewId,
    summary: `Launch review ${params.department}: ${params.result}`,
    after: {
      department: params.department,
      result: params.result,
      notes: params.notes,
    },
    meta: { agent_name: params.agentName, agent_run_id: params.agentRunId },
  });

  return refreshLaunchReviewStatus(params.organizationId, params.reviewId);
}

async function refreshLaunchReviewStatus(
  organizationId: string,
  reviewId: string,
) {
  const supabase = createAdminClient();
  const { data: signoffs } = await adsTable(supabase, "ad_launch_review_signoffs")
    .select("department, result")
    .eq("review_id", reviewId);

  const rows = (signoffs ?? []) as Array<{
    department: string;
    result: string;
  }>;
  const allPresent = LAUNCH_REVIEW_DEPARTMENTS.every((d) =>
    rows.some((r) => r.department === d),
  );
  const anyFail = rows.some((r) => r.result === "fail");
  const anyPending = rows.some((r) => r.result === "pending");
  const allPass =
    allPresent &&
    rows.length >= LAUNCH_REVIEW_DEPARTMENTS.length &&
    rows.every((r) => r.result === "pass");

  const status = anyFail
    ? "failed"
    : allPass
      ? "passed"
      : anyPending
        ? "in_progress"
        : "pending";

  await adsTable(supabase, "ad_launch_reviews")
    .update({
      status,
      all_passed: allPass,
    })
    .eq("id", reviewId)
    .eq("organization_id", organizationId);

  return { status, allPass, anyFail };
}

/**
 * Deterministic department checks (structure). Agents can refine notes later.
 */
export async function runDeterministicLaunchChecks(params: {
  organizationId: string;
  brandId: string;
  campaignId: string;
  reviewId: string;
}) {
  const supabase = createAdminClient();
  const { data: campaign } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("id", params.campaignId)
    .single();
  if (!campaign) throw new Error("Campaign not found");

  const { data: creatives } = await supabase
    .from("ad_creatives")
    .select("*")
    .eq("campaign_id", params.campaignId);

  const { data: limits } = await supabase
    .from("org_ad_limits")
    .select("*")
    .eq("organization_id", params.organizationId)
    .is("brand_id", null)
    .maybeSingle();

  const targeting = (campaign.targeting ?? {}) as Record<string, unknown>;
  const finalUrl = String(targeting.final_url ?? targeting.finalUrl ?? "");

  // Finance
  const daily = campaign.daily_budget_pence ?? 0;
  const financeFindings: SignoffFinding[] = [];
  if (!limits) {
    financeFindings.push({
      code: "no_limits",
      severity: "critical",
      message: "org_ad_limits missing",
    });
  } else {
    if (limits.writes_paused) {
      financeFindings.push({
        code: "writes_paused",
        severity: "critical",
        message: "Master pause is on — unblock Ads → Settings before launch",
      });
    }
    if (daily > limits.max_single_campaign_daily_budget_pence) {
      financeFindings.push({
        code: "over_campaign_cap",
        severity: "critical",
        message: `Daily budget ${daily}p exceeds per-campaign cap ${limits.max_single_campaign_daily_budget_pence}p`,
      });
    }
    if (daily > limits.max_daily_spend_pence) {
      financeFindings.push({
        code: "over_org_cap",
        severity: "critical",
        message: `Daily budget ${daily}p exceeds org daily cap ${limits.max_daily_spend_pence}p`,
      });
    }
  }
  await recordLaunchSignoff({
    organizationId: params.organizationId,
    reviewId: params.reviewId,
    department: "finance",
    result: financeFindings.some((f) => f.severity === "critical")
      ? "fail"
      : "pass",
    notes: financeFindings.length
      ? financeFindings.map((f) => f.message).join("; ")
      : `Within org limits (daily ${daily}p)`,
    findings: financeFindings,
    agentName: "ads_launch_finance",
  });

  // Research
  const researchFindings: SignoffFinding[] = [];
  if (!campaign.targeting_brief_id && !targeting.evidence) {
    researchFindings.push({
      code: "no_evidence",
      severity: "critical",
      message: "No targeting brief / evidence cited",
    });
  }
  await recordLaunchSignoff({
    organizationId: params.organizationId,
    reviewId: params.reviewId,
    department: "research",
    result: researchFindings.length ? "fail" : "pass",
    notes: researchFindings.length
      ? researchFindings.map((f) => f.message).join("; ")
      : "Targeting brief / evidence present",
    findings: researchFindings,
    agentName: "ads_launch_research",
  });

  // Brand
  const brandFindings: SignoffFinding[] = [];
  const approved = (creatives ?? []).filter((c) => c.status === "approved");
  if (!approved.length) {
    brandFindings.push({
      code: "no_approved_creative",
      severity: "critical",
      message: "Need at least one approved creative",
    });
  }
  for (const c of approved) {
    if (!(c.media_urls ?? []).length) {
      brandFindings.push({
        code: "missing_image",
        severity: "critical",
        message: `Creative ${c.variant_label ?? c.id} missing image`,
      });
    }
  }
  await recordLaunchSignoff({
    organizationId: params.organizationId,
    reviewId: params.reviewId,
    department: "brand",
    result: brandFindings.some((f) => f.severity === "critical")
      ? "fail"
      : "pass",
    notes: brandFindings.length
      ? brandFindings.map((f) => f.message).join("; ")
      : `${approved.length} approved creative(s) with media`,
    findings: brandFindings,
    agentName: "ads_launch_brand",
  });

  // QA
  const qaFindings: SignoffFinding[] = [];
  if (!finalUrl.startsWith("http")) {
    qaFindings.push({
      code: "bad_url",
      severity: "critical",
      message: "Final URL missing or not https",
    });
  } else {
    try {
      const res = await fetch(finalUrl, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status < 200 || res.status >= 400) {
        qaFindings.push({
          code: "url_not_2xx",
          severity: "critical",
          message: `Final URL returned ${res.status}`,
        });
      }
    } catch (err) {
      qaFindings.push({
        code: "url_unreachable",
        severity: "critical",
        message: err instanceof Error ? err.message : "URL unreachable",
      });
    }
    if (!/[?&]utm_/i.test(finalUrl)) {
      qaFindings.push({
        code: "missing_utm",
        severity: "warning",
        message: "No UTM params on final URL",
      });
    }
  }
  for (const c of creatives ?? []) {
    const text = `${c.headline ?? ""} ${c.primary_text ?? ""}`;
    if (/TODO|PLACEHOLDER|lorem ipsum/i.test(text)) {
      qaFindings.push({
        code: "placeholder_copy",
        severity: "critical",
        message: "Placeholder copy detected",
      });
    }
  }
  await recordLaunchSignoff({
    organizationId: params.organizationId,
    reviewId: params.reviewId,
    department: "qa",
    result: qaFindings.some((f) => f.severity === "critical") ? "fail" : "pass",
    notes: qaFindings.length
      ? qaFindings.map((f) => f.message).join("; ")
      : "URLs and copy QA passed",
    findings: qaFindings,
    agentName: "ads_launch_qa",
  });

  // Compliance — re-use latest entity checks when present; otherwise light URL + claim gate
  const complianceFindings: SignoffFinding[] = [];
  for (const c of approved) {
    const { data: check } = await supabase
      .from("compliance_checks")
      .select("status, findings")
      .eq("organization_id", params.organizationId)
      .eq("entity_type", "ad")
      .eq("entity_id", c.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!check) {
      complianceFindings.push({
        code: "no_compliance_check",
        severity: "warning",
        message: `No compliance check on creative ${c.id}`,
      });
    } else if (check.status === "fail") {
      complianceFindings.push({
        code: "compliance_fail",
        severity: "critical",
        message: `Creative ${c.id} compliance fail`,
      });
    }
  }
  if (!finalUrl) {
    complianceFindings.push({
      code: "no_final_url",
      severity: "critical",
      message: "Final URL required for link validation",
    });
  }
  await recordLaunchSignoff({
    organizationId: params.organizationId,
    reviewId: params.reviewId,
    department: "compliance",
    result: complianceFindings.some((f) => f.severity === "critical")
      ? "fail"
      : "pass",
    notes: complianceFindings.length
      ? complianceFindings.map((f) => f.message).join("; ")
      : "Compliance checks acceptable",
    findings: complianceFindings,
    agentName: "ads_launch_compliance",
  });

  return refreshLaunchReviewStatus(params.organizationId, params.reviewId);
}

export async function cmoApproveLaunchReview(params: {
  organizationId: string;
  campaignId: string;
  actorUserId: string | null;
  note?: string | null;
  agentRunId?: string | null;
}) {
  const supabase = createAdminClient();
  const { data: review } = await adsTable(supabase, "ad_launch_reviews")
    .select("*")
    .eq("campaign_id", params.campaignId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (!review) throw new Error("Launch review not found");
  if (!review.all_passed) {
    throw new Error(
      "CMO cannot approve until Compliance, Finance, Brand, Research, and QA all pass",
    );
  }

  const now = new Date().toISOString();
  await adsTable(supabase, "ad_launch_reviews")
    .update({
      cmo_approved_at: now,
      cmo_approved_by: params.actorUserId,
      cmo_note: params.note ?? null,
      cmo_agent_run_id: params.agentRunId ?? null,
    })
    .eq("id", review.id);

  await supabase
    .from("ad_campaigns")
    .update({
      launch_approved_at: now,
      launch_approved_by: params.actorUserId,
      status: "approved",
    })
    .eq("id", params.campaignId);

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: "ad_cmo_launch_approve",
    entityType: "ad_campaign",
    entityId: params.campaignId,
    summary: "CMO approved campaign for Meta create (paused)",
    after: { launch_review_id: review.id, note: params.note },
    meta: { agent_run_id: params.agentRunId },
  });

  return review.id as string;
}
