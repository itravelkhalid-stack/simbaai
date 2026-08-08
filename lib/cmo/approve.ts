import "server-only";

import { generateSinglePostVariants } from "@/lib/agents/content/generate";
import { runClaudeJson } from "@/lib/agents/claude-json";
import {
  cmoApproveDecisionSchema,
  cmoApprovePrompt,
  type CmoApproveDecision,
} from "@/lib/agents/prompts/content/cmo-approve";
import { isMeteredAgentName } from "@/lib/billing/metering";
import { getBrandContext } from "@/lib/brand/context";
import { writeAuditEvent } from "@/lib/compliance/audit";
import { runEntityComplianceCheck } from "@/lib/compliance/check";
import { shouldParkForBrandFit } from "@/lib/cmo/severity";
import { CMO_APPROVAL_LABEL } from "@/lib/cmo/settings";
import { assignScheduleSlotUnderCadence } from "@/lib/content/schedule-slots";
import { findRecentNearDuplicate } from "@/lib/content/topic-dedupe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentFormat, ContentItem, ContentPlatform } from "@/lib/types/content";
import type { ComplianceCheck } from "@/lib/types/compliance";

export type CmoReviewResult = {
  itemId: string;
  outcome: "approved" | "scheduled" | "parked" | "skipped";
  detail: string;
};

async function instagramCanSchedule(params: {
  organizationId: string;
  brandId: string;
  itemId: string;
  mediaUrls: string[] | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const media = params.mediaUrls ?? [];
  const supabase = createAdminClient();
  const { count: linkedCount } = await supabase
    .from("content_item_media")
    .select("id", { count: "exact", head: true })
    .eq("content_item_id", params.itemId)
    .eq("organization_id", params.organizationId);

  if (!media.length && !(linkedCount && linkedCount > 0)) {
    return {
      ok: false,
      reason:
        "Awaiting image — Instagram needs a library image before the CMO can schedule.",
    };
  }

  const { data: igConnection } = await supabase
    .from("social_connections")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .eq("platform", "instagram")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const { data: fbConnection } = await supabase
    .from("social_connections")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .eq("platform", "facebook")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!igConnection && !fbConnection) {
    return {
      ok: false,
      reason: "No active Instagram/Meta connection — parked for human.",
    };
  }
  return { ok: true };
}

async function parkItem(params: {
  organizationId: string;
  itemId: string;
  beforeStatus: string;
  note: string;
  agentRunId: string | null;
}) {
  const supabase = createAdminClient();
  await supabase
    .from("content_items")
    .update({
      status: "pending_approval",
      cmo_note: params.note,
    })
    .eq("id", params.itemId)
    .eq("organization_id", params.organizationId);

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: null,
    action: "cmo_parked",
    entityType: "content",
    entityId: params.itemId,
    summary: `CMO parked for human: ${params.note.slice(0, 160)}`,
    before: { status: params.beforeStatus },
    after: { status: "pending_approval", cmo_note: params.note },
    meta: { agent_run_id: params.agentRunId, agent: "cmo_auto_approve" },
  });
}

async function applyApproval(params: {
  organizationId: string;
  brandId: string;
  item: ContentItem;
  agentRunId: string | null;
}): Promise<CmoReviewResult> {
  const item = params.item;

  const dup = await findRecentNearDuplicate({
    organizationId: params.organizationId,
    brandId: params.brandId,
    title: item.title,
    copy: item.copy,
    excludeItemId: item.id,
    days: 14,
  });
  if (dup) {
    const note = `Near-duplicate of recent content (“${dup.title.slice(0, 80)}”) — parked. Diversify topic before rescheduling.`;
    await parkItem({
      organizationId: params.organizationId,
      itemId: item.id,
      beforeStatus: item.status,
      note,
      agentRunId: params.agentRunId,
    });
    return { itemId: item.id, outcome: "parked", detail: note };
  }

  // Always place under daily cadence caps when scheduling (or when we have a preferred day).
  let scheduledAt = item.scheduled_at;
  if (scheduledAt) {
    const placed = await assignScheduleSlotUnderCadence({
      organizationId: params.organizationId,
      brandId: params.brandId,
      itemId: item.id,
      platform: item.platform as ContentPlatform,
      format: item.format as ContentFormat,
      preferredAt: scheduledAt,
      forceWrite: true,
    });
    if (!placed.ok) {
      await parkItem({
        organizationId: params.organizationId,
        itemId: item.id,
        beforeStatus: item.status,
        note: placed.reason,
        agentRunId: params.agentRunId,
      });
      return { itemId: item.id, outcome: "parked", detail: placed.reason };
    }
    scheduledAt = placed.scheduledAt;
  }

  const nextStatus: "scheduled" | "approved" = scheduledAt
    ? "scheduled"
    : "approved";

  if (nextStatus === "scheduled" && item.platform === "instagram") {
    const gate = await instagramCanSchedule({
      organizationId: params.organizationId,
      brandId: params.brandId,
      itemId: item.id,
      mediaUrls: item.media_urls,
    });
    if (!gate.ok) {
      await parkItem({
        organizationId: params.organizationId,
        itemId: item.id,
        beforeStatus: item.status,
        note: gate.reason,
        agentRunId: params.agentRunId,
      });
      return { itemId: item.id, outcome: "parked", detail: gate.reason };
    }
  }

  const now = new Date().toISOString();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("content_items")
    .update({
      status: nextStatus,
      scheduled_at: scheduledAt,
      rejection_reason: null,
      cmo_note: null,
      approval_label: CMO_APPROVAL_LABEL,
      approved_at: now,
    })
    .eq("id", item.id)
    .eq("organization_id", params.organizationId);
  if (error) throw new Error(error.message);

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: null,
    action: nextStatus === "scheduled" ? "publish" : "approval",
    entityType: "content",
    entityId: item.id,
    summary: `${CMO_APPROVAL_LABEL} → ${nextStatus}`,
    before: { status: item.status, scheduled_at: item.scheduled_at },
    after: {
      status: nextStatus,
      scheduled_at: scheduledAt,
      approval_label: CMO_APPROVAL_LABEL,
      approved_at: now,
    },
    meta: { agent_run_id: params.agentRunId, agent: "cmo_auto_approve" },
  });

  return {
    itemId: item.id,
    outcome: nextStatus,
    detail: CMO_APPROVAL_LABEL,
  };
}

async function regenerateForCompliance(params: {
  organizationId: string;
  brandId: string;
  item: ContentItem;
  compliance: ComplianceCheck;
}): Promise<ContentItem> {
  const brandContext = await getBrandContext(
    params.organizationId,
    params.brandId,
    { admin: true },
  );
  const findingsText = (params.compliance.findings ?? [])
    .map((f) => `[${f.severity}] ${f.message}${f.suggestion ? ` → ${f.suggestion}` : ""}`)
    .join("\n");

  const generated = await generateSinglePostVariants({
    brandContext,
    platform: params.item.platform as ContentPlatform,
    format: params.item.format as ContentFormat,
    topic: params.item.title || params.item.copy.slice(0, 200),
    rejectionReason: `Compliance fixer pass — address these findings:\n${findingsText}`,
  });
  const variant = generated.data.variants[0];
  if (!variant) throw new Error("CMO regeneration returned no variants");

  const supabase = createAdminClient();
  const { data: updated, error } = await supabase
    .from("content_items")
    .update({
      title: variant.title ?? params.item.title,
      copy: variant.copy,
      hashtags: variant.hashtags,
      structured: {
        ...(params.item.structured ?? {}),
        ...variant.structured,
        rationale: variant.rationale,
        cmo_regenerated: true,
      },
      cmo_regeneration_attempted: true,
    })
    .eq("id", params.item.id)
    .eq("organization_id", params.organizationId)
    .select("*")
    .single();
  if (error || !updated) throw new Error(error?.message ?? "regen update failed");

  await runEntityComplianceCheck({
    organizationId: params.organizationId,
    brandId: params.brandId,
    entityType: "content",
    entityId: params.item.id,
    title: updated.title,
    body: updated.copy,
    extra: {
      platform: updated.platform,
      format: updated.format,
      hashtags: updated.hashtags,
      structured: updated.structured,
    },
    syncContentFlags: true,
  });

  return updated as ContentItem;
}

/**
 * Review one pending_approval item: compliance → optional regen → brand-fit → approve/schedule or park.
 */
export async function reviewContentItemAsCmo(params: {
  organizationId: string;
  brandId: string;
  itemId: string;
}): Promise<CmoReviewResult> {
  const supabase = createAdminClient();
  const { data: itemRow, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("id", params.itemId)
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .maybeSingle();
  if (error || !itemRow) {
    return {
      itemId: params.itemId,
      outcome: "skipped",
      detail: error?.message ?? "Item not found",
    };
  }

  const item = itemRow as ContentItem & {
    cmo_regeneration_attempted?: boolean;
  };

  if (item.status !== "pending_approval") {
    return {
      itemId: item.id,
      outcome: "skipped",
      detail: `Status is ${item.status}`,
    };
  }

  const { data: run } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: params.organizationId,
      module: "content",
      agent_name: "cmo_auto_approve",
      status: "running",
      progress: 10,
      metered: isMeteredAgentName("cmo_auto_approve"),
      input: { itemId: params.itemId, brandId: params.brandId },
    })
    .select("id")
    .single();

  try {
    let working = item;
    let compliance = await runEntityComplianceCheck({
      organizationId: params.organizationId,
      brandId: params.brandId,
      entityType: "content",
      entityId: working.id,
      title: working.title,
      body: working.copy,
      extra: {
        platform: working.platform,
        format: working.format,
        hashtags: working.hashtags,
        structured: working.structured,
      },
      syncContentFlags: true,
    });

    if (compliance.status === "fail") {
      if (!working.cmo_regeneration_attempted) {
        working = (await regenerateForCompliance({
          organizationId: params.organizationId,
          brandId: params.brandId,
          item: working,
          compliance,
        })) as typeof working;

        compliance = await runEntityComplianceCheck({
          organizationId: params.organizationId,
          brandId: params.brandId,
          entityType: "content",
          entityId: working.id,
          title: working.title,
          body: working.copy,
          extra: {
            platform: working.platform,
            format: working.format,
            hashtags: working.hashtags,
            structured: working.structured,
          },
          syncContentFlags: true,
        });
      }

      if (compliance.status === "fail") {
        const note = `CMO could not clear compliance after ${working.cmo_regeneration_attempted ? "regeneration" : "review"}. Needs human.`;
        await parkItem({
          organizationId: params.organizationId,
          itemId: working.id,
          beforeStatus: working.status,
          note,
          agentRunId: run?.id ?? null,
        });
        if (run) {
          await supabase
            .from("agent_runs")
            .update({
              status: "complete",
              progress: 100,
              output: { outcome: "parked", reason: "compliance_fail" },
            })
            .eq("id", run.id);
        }
        return { itemId: working.id, outcome: "parked", detail: note };
      }
    }

    const brandContext = await getBrandContext(
      params.organizationId,
      params.brandId,
      { admin: true },
    );

    const promptInput = {
      brandName: brandContext.brand.name,
      brandVoice: brandContext.brand.brand_voice ?? "",
      targetAudience:
        brandContext.audiences
          .map((a) => a.name)
          .filter(Boolean)
          .join(", ") || brandContext.guidelinesDigest,
      platform: working.platform,
      format: working.format,
      title: working.title,
      copy: working.copy,
      hashtags: working.hashtags ?? [],
      complianceStatus: compliance.status,
      complianceFindings: compliance.findings,
    };

    let decision: {
      data: CmoApproveDecision;
      model: string;
      tokensIn: number;
      tokensOut: number;
      costPence: number;
    };
    try {
      decision = await runClaudeJson({
        system: cmoApprovePrompt.system,
        user: cmoApprovePrompt.buildUserPrompt(promptInput),
        schema: cmoApproveDecisionSchema,
        maxTokens: 1200,
      });
    } catch (firstErr) {
      // Retry the whole brand-fit call once, then park with visible reason.
      try {
        decision = await runClaudeJson({
          system: cmoApprovePrompt.system,
          user: cmoApprovePrompt.buildUserPrompt(promptInput),
          schema: cmoApproveDecisionSchema,
          maxTokens: 1200,
        });
      } catch (secondErr) {
        const message =
          secondErr instanceof Error
            ? secondErr.message
            : firstErr instanceof Error
              ? firstErr.message
              : "CMO brand-fit API error";
        throw new Error(message);
      }
    }

    // Organic severity: WARN/PASS must not park via brand-fit unless fit is truly poor.
    const wantsPark =
      decision.data.decision === "park" || decision.data.brand_fit === "poor";
    if (
      shouldParkForBrandFit({
        decision: decision.data,
        complianceStatus: compliance.status,
      })
    ) {
      const note =
        decision.data.park_reason?.trim() ||
        decision.data.rationale ||
        "Parked for brand-fit — needs human review.";
      await parkItem({
        organizationId: params.organizationId,
        itemId: working.id,
        beforeStatus: working.status,
        note,
        agentRunId: run?.id ?? null,
      });
      if (run) {
        await supabase
          .from("agent_runs")
          .update({
            status: "complete",
            progress: 100,
            model: decision.model,
            tokens_in: decision.tokensIn,
            tokens_out: decision.tokensOut,
            cost_pence: decision.costPence,
            output: { outcome: "parked", decision: decision.data },
          })
          .eq("id", run.id);
      }
      return { itemId: working.id, outcome: "parked", detail: note };
    }

    const result = await applyApproval({
      organizationId: params.organizationId,
      brandId: params.brandId,
      item: working,
      agentRunId: run?.id ?? null,
    });

    if (run) {
      await supabase
        .from("agent_runs")
        .update({
          status: "complete",
          progress: 100,
          model: decision.model,
          tokens_in: decision.tokensIn,
          tokens_out: decision.tokensOut,
          cost_pence: decision.costPence,
          output: {
            outcome: result.outcome,
            decision: decision.data,
            warn_park_overridden: wantsPark,
          },
        })
        .eq("id", run.id);
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "CMO review failed";
    // One retry already happens inside runClaudeJson for API 400s; park visibly.
    try {
      await parkItem({
        organizationId: params.organizationId,
        itemId: item.id,
        beforeStatus: item.status,
        note: `CMO review error — needs human: ${message.slice(0, 400)}`,
        agentRunId: run?.id ?? null,
      });
    } catch {
      // Keep original failure if park update also fails
    }
    if (run) {
      await supabase
        .from("agent_runs")
        .update({ status: "failed", progress: 100, error: message })
        .eq("id", run.id);
    }
    return {
      itemId: item.id,
      outcome: "parked",
      detail: message,
    };
  }
}
