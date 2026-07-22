"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertPlanAllows } from "@/lib/billing/plans";
import { inngest } from "@/lib/inngest/client";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import {
  commentSchema,
  generateBatchSchema,
  generateSingleSchema,
  moderationSchema,
  pillarSchema,
  rescheduleSchema,
  updateItemSchema,
} from "@/lib/validations/content";
import type { ContentPlatform } from "@/lib/types/content";

export type ContentActionResult = {
  error?: string;
  success?: string;
};

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot modify content");
  }
  return ctx;
}

async function assertCanScheduleInstagram(params: {
  organizationId: string;
  itemId: string;
}) {
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("content_items")
    .select("platform, media_urls")
    .eq("id", params.itemId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (!item) throw new Error("Content item not found");
  if (item.platform !== "instagram") return;
  const media = (item.media_urls as string[] | null) ?? [];
  if (!media.length) {
    throw new Error(
      "Instagram posts require at least one uploaded image before scheduling. Add media on the content item, then try again.",
    );
  }
}

async function getPrimaryBrandId(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_primary", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data.id;
  const { data: fallback, error: fallbackError } = await supabase
    .from("brands")
    .select("id")
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();
  if (fallbackError) throw new Error(fallbackError.message);
  if (!fallback) throw new Error("No brand found");
  return fallback.id;
}

export async function createPillar(
  _prev: ContentActionResult,
  formData: FormData,
): Promise<ContentActionResult> {
  const parsed = pillarSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    targetPct: formData.get("targetPct"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const { active } = await assertCanWrite();
    const brandId = await getPrimaryBrandId(active.organization_id);
    const supabase = await createClient();
    const { error } = await supabase.from("content_pillars").insert({
      organization_id: active.organization_id,
      brand_id: brandId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      target_pct: parsed.data.targetPct,
    });
    if (error) return { error: error.message };
    revalidatePath("/content/pillars");
    return { success: "Pillar created" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function queueSingleGenerate(
  _prev: ContentActionResult,
  formData: FormData,
): Promise<ContentActionResult> {
  const parsed = generateSingleSchema.safeParse({
    platform: formData.get("platform"),
    format: formData.get("format"),
    pillarId: formData.get("pillarId") || undefined,
    topic: formData.get("topic"),
    sourceItemId: formData.get("sourceItemId") || undefined,
    model: formData.get("model") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const { user, active } = await assertCanWrite();
    await assertPlanAllows(active.organization_id, "ai_runs_month");
    const brandId = await getPrimaryBrandId(active.organization_id);
    const supabase = await createClient();

    let rejectionReason: string | undefined;
    if (parsed.data.sourceItemId) {
      const { data: source } = await supabase
        .from("content_items")
        .select("rejection_reason")
        .eq("id", parsed.data.sourceItemId)
        .eq("organization_id", active.organization_id)
        .maybeSingle();
      rejectionReason = source?.rejection_reason ?? undefined;
    }

    const { data: run, error: runError } = await supabase
      .from("agent_runs")
      .insert({
        organization_id: active.organization_id,
        module: "content",
        agent_name: "content_single_post",
        status: "queued",
        input: parsed.data,
        logs: [{ at: new Date().toISOString(), message: "Queued single generation" }],
        progress: 0,
      })
      .select("id")
      .single();
    if (runError || !run) return { error: runError?.message ?? "Failed to queue" };

    await inngest.send({
      name: "content/generate.single",
      data: {
        organizationId: active.organization_id,
        brandId,
        agentRunId: run.id,
        platform: parsed.data.platform,
        format: parsed.data.format,
        pillarId: parsed.data.pillarId || undefined,
        topic: parsed.data.topic,
        rejectionReason,
        model: parsed.data.model || undefined,
        createdBy: user.id,
        sourceItemId: parsed.data.sourceItemId || undefined,
      },
    });

    redirect(`/content/queue?run=${run.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: error instanceof Error ? error.message : "Failed to generate" };
  }
}

export async function queueBatchPropose(
  _prev: ContentActionResult,
  formData: FormData,
): Promise<ContentActionResult> {
  const parsed = generateBatchSchema.safeParse({
    title: formData.get("title"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    brief: formData.get("brief"),
    model: formData.get("model") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const { user, active } = await assertCanWrite();
    await assertPlanAllows(active.organization_id, "ai_runs_month");
    const brandId = await getPrimaryBrandId(active.organization_id);
    const supabase = await createClient();

    const { data: run, error: runError } = await supabase
      .from("agent_runs")
      .insert({
        organization_id: active.organization_id,
        module: "content",
        agent_name: "content_batch_plan",
        status: "queued",
        input: parsed.data,
        logs: [{ at: new Date().toISOString(), message: "Queued batch proposal" }],
        progress: 0,
      })
      .select("id")
      .single();
    if (runError || !run) return { error: runError?.message ?? "Failed to queue" };

    const { data: plan, error: planError } = await supabase
      .from("content_plans")
      .insert({
        organization_id: active.organization_id,
        brand_id: brandId,
        title: parsed.data.title,
        status: "draft",
        start_date: parsed.data.startDate,
        end_date: parsed.data.endDate,
        brief: { notes: parsed.data.brief, model: parsed.data.model },
        agent_run_id: run.id,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (planError || !plan) return { error: planError?.message ?? "Failed to create plan" };

    await inngest.send({
      name: "content/generate.batch-propose",
      data: {
        planId: plan.id,
        agentRunId: run.id,
        organizationId: active.organization_id,
        brandId,
        model: parsed.data.model || undefined,
      },
    });

    redirect(`/content/plans/${plan.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: error instanceof Error ? error.message : "Failed to start batch" };
  }
}

export async function setPlanSlotStatus(formData: FormData) {
  const slotId = String(formData.get("slotId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!slotId || !["approved", "rejected", "proposed"].includes(status)) {
    throw new Error("Invalid slot update");
  }

  const { active } = await assertCanWrite();
  const supabase = await createClient();
  const { error } = await supabase
    .from("content_plan_slots")
    .update({ status: status as "approved" | "rejected" | "proposed" })
    .eq("id", slotId)
    .eq("organization_id", active.organization_id);
  if (error) throw new Error(error.message);

  const { data: slot } = await supabase
    .from("content_plan_slots")
    .select("plan_id")
    .eq("id", slotId)
    .single();
  if (slot) revalidatePath(`/content/plans/${slot.plan_id}`);
}

export async function generateApprovedSlots(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  if (!planId) throw new Error("Missing plan");

  const { user, active } = await assertCanWrite();
  await assertPlanAllows(active.organization_id, "ai_runs_month");
  const brandId = await getPrimaryBrandId(active.organization_id);
  const supabase = await createClient();

  const { count } = await supabase
    .from("content_plan_slots")
    .select("*", { count: "exact", head: true })
    .eq("plan_id", planId)
    .eq("organization_id", active.organization_id)
    .eq("status", "approved");

  if (!count) throw new Error("Approve at least one slot first");

  const { data: run, error: runError } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: active.organization_id,
      module: "content",
      agent_name: "content_batch_generate",
      status: "queued",
      input: { planId },
      logs: [{ at: new Date().toISOString(), message: "Queued approved slot generation" }],
      progress: 0,
    })
    .select("id")
    .single();
  if (runError || !run) throw new Error(runError?.message ?? "Failed to queue");

  await inngest.send({
    name: "content/generate.batch-slots",
    data: {
      planId,
      agentRunId: run.id,
      organizationId: active.organization_id,
      brandId,
      createdBy: user.id,
    },
  });

  revalidatePath(`/content/plans/${planId}`);
  redirect(`/content/queue?run=${run.id}`);
}

export async function queueRepurpose(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) throw new Error("Missing item");

  const { user, active } = await assertCanWrite();
  await assertPlanAllows(active.organization_id, "ai_runs_month");
  const brandId = await getPrimaryBrandId(active.organization_id);
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("content_items")
    .select("id")
    .eq("id", itemId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!item) throw new Error("Item not found");

  const { data: run, error: runError } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: active.organization_id,
      module: "content",
      agent_name: "content_repurpose",
      status: "queued",
      input: { itemId },
      logs: [{ at: new Date().toISOString(), message: "Queued repurpose" }],
      progress: 0,
    })
    .select("id")
    .single();
  if (runError || !run) throw new Error(runError?.message ?? "Failed to queue");

  await inngest.send({
    name: "content/generate.repurpose",
    data: {
      organizationId: active.organization_id,
      brandId,
      agentRunId: run.id,
      sourceItemId: itemId,
      createdBy: user.id,
    },
  });

  redirect(`/content/queue?run=${run.id}`);
}

export async function updateContentItem(
  _prev: ContentActionResult,
  formData: FormData,
): Promise<ContentActionResult> {
  const parsed = updateItemSchema.safeParse({
    itemId: formData.get("itemId"),
    copy: formData.get("copy") ?? undefined,
    title: formData.get("title") ?? undefined,
    hashtags: formData.get("hashtags") ?? undefined,
    scheduledAt: formData.get("scheduledAt") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const { active } = await assertCanWrite();
    const supabase = await createClient();
    const hashtags = parsed.data.hashtags
      ? parsed.data.hashtags
          .split(/[\s,]+/)
          .map((t) => t.replace(/^#/, "").trim())
          .filter(Boolean)
      : undefined;

    const willSchedule = Boolean(parsed.data.scheduledAt);
    if (willSchedule) {
      try {
        await assertCanScheduleInstagram({
          organizationId: active.organization_id,
          itemId: parsed.data.itemId,
        });
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Cannot schedule",
        };
      }
    }

    const { error } = await supabase
      .from("content_items")
      .update({
        ...(parsed.data.copy != null ? { copy: parsed.data.copy } : {}),
        ...(parsed.data.title != null ? { title: parsed.data.title } : {}),
        ...(hashtags ? { hashtags } : {}),
        ...(parsed.data.scheduledAt !== undefined
          ? {
              scheduled_at: parsed.data.scheduledAt
                ? new Date(parsed.data.scheduledAt).toISOString()
                : null,
              status: parsed.data.scheduledAt ? "scheduled" : undefined,
            }
          : {}),
      })
      .eq("id", parsed.data.itemId)
      .eq("organization_id", active.organization_id);

    if (error) return { error: error.message };
    revalidatePath(`/content/${parsed.data.itemId}`);
    revalidatePath("/content/queue");
    revalidatePath("/content/calendar");
    return { success: "Saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to save" };
  }
}

export async function approveContentItem(formData: FormData) {
  const parsed = moderationSchema.safeParse({ itemId: formData.get("itemId") });
  if (!parsed.success) throw new Error("Invalid item");

  const { user, active } = await assertCanWrite();
  const overrideReason = String(formData.get("overrideReason") ?? "").trim();

  const { assertComplianceAllowsApproval } = await import(
    "@/lib/compliance/gate"
  );
  const { writeAuditEvent } = await import("@/lib/compliance/audit");

  await assertComplianceAllowsApproval({
    organizationId: active.organization_id,
    entityType: "content",
    entityId: parsed.data.itemId,
    userId: user.id,
    role: active.role,
    overrideReason: overrideReason || null,
    actionLabel: "Approve content item",
  });

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("content_items")
    .select("scheduled_at, status, platform, media_urls")
    .eq("id", parsed.data.itemId)
    .eq("organization_id", active.organization_id)
    .single();

  const nextStatus = item?.scheduled_at ? "scheduled" : "approved";
  if (nextStatus === "scheduled") {
    await assertCanScheduleInstagram({
      organizationId: active.organization_id,
      itemId: parsed.data.itemId,
    });
  }
  const { error } = await supabase
    .from("content_items")
    .update({
      status: nextStatus,
      rejection_reason: null,
    })
    .eq("id", parsed.data.itemId)
    .eq("organization_id", active.organization_id);
  if (error) throw new Error(error.message);

  await writeAuditEvent({
    organizationId: active.organization_id,
    actorUserId: user.id,
    action: nextStatus === "scheduled" ? "publish" : "approval",
    entityType: "content",
    entityId: parsed.data.itemId,
    summary: `Content ${nextStatus}`,
    before: { status: item?.status },
    after: { status: nextStatus },
  });

  revalidatePath("/content/queue");
  revalidatePath(`/content/${parsed.data.itemId}`);
}

export async function rejectContentItem(
  _prev: ContentActionResult,
  formData: FormData,
): Promise<ContentActionResult> {
  const parsed = moderationSchema.safeParse({
    itemId: formData.get("itemId"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (!parsed.data.reason?.trim()) {
    return { error: "Rejection reason is required (fed back on regeneration)" };
  }

  try {
    const { active } = await assertCanWrite();
    const supabase = await createClient();
    const { error } = await supabase
      .from("content_items")
      .update({
        status: "rejected",
        rejection_reason: parsed.data.reason,
      })
      .eq("id", parsed.data.itemId)
      .eq("organization_id", active.organization_id);
    if (error) return { error: error.message };
    revalidatePath("/content/queue");
    revalidatePath(`/content/${parsed.data.itemId}`);
    return { success: "Rejected — regenerate with this feedback from the item page" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Reject failed" };
  }
}

export async function addContentComment(
  _prev: ContentActionResult,
  formData: FormData,
): Promise<ContentActionResult> {
  const parsed = commentSchema.safeParse({
    itemId: formData.get("itemId"),
    comment: formData.get("comment"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const { user, active } = await assertCanWrite();
    const supabase = await createClient();
    const { error } = await supabase.from("content_comments").insert({
      organization_id: active.organization_id,
      item_id: parsed.data.itemId,
      user_id: user.id,
      comment: parsed.data.comment,
    });
    if (error) return { error: error.message };
    revalidatePath(`/content/${parsed.data.itemId}`);
    return { success: "Comment added" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Comment failed" };
  }
}

export async function resolveComment(formData: FormData) {
  const commentId = String(formData.get("commentId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!commentId) throw new Error("Missing comment");

  const { active } = await assertCanWrite();
  const supabase = await createClient();
  const { error } = await supabase
    .from("content_comments")
    .update({ resolved: true })
    .eq("id", commentId)
    .eq("organization_id", active.organization_id);
  if (error) throw new Error(error.message);
  revalidatePath(`/content/${itemId}`);
}

export async function rescheduleContentItem(formData: FormData) {
  const parsed = rescheduleSchema.safeParse({
    itemId: formData.get("itemId"),
    scheduledAt: formData.get("scheduledAt"),
  });
  if (!parsed.success) throw new Error("Invalid reschedule");

  const { active } = await assertCanWrite();
  await assertCanScheduleInstagram({
    organizationId: active.organization_id,
    itemId: parsed.data.itemId,
  });
  const supabase = await createClient();
  const scheduledAt = new Date(parsed.data.scheduledAt).toISOString();
  const { error } = await supabase
    .from("content_items")
    .update({
      scheduled_at: scheduledAt,
      status: "scheduled",
    })
    .eq("id", parsed.data.itemId)
    .eq("organization_id", active.organization_id);
  if (error) throw new Error(error.message);
  revalidatePath("/content/calendar");
}

export async function regenerateRejectedItem(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) throw new Error("Missing item");

  const { user, active } = await assertCanWrite();
  await assertPlanAllows(active.organization_id, "ai_runs_month");
  const brandId = await getPrimaryBrandId(active.organization_id);
  const supabase = await createClient();
  const { data: item, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("id", itemId)
    .eq("organization_id", active.organization_id)
    .single();
  if (error || !item) throw new Error(error?.message ?? "Item not found");

  const { data: run, error: runError } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: active.organization_id,
      module: "content",
      agent_name: "content_single_post",
      status: "queued",
      input: { regenerateFrom: itemId, rejection_reason: item.rejection_reason },
      logs: [{ at: new Date().toISOString(), message: "Queued regeneration with rejection feedback" }],
      progress: 0,
    })
    .select("id")
    .single();
  if (runError || !run) throw new Error(runError?.message ?? "Failed to queue");

  await inngest.send({
    name: "content/generate.single",
    data: {
      organizationId: active.organization_id,
      brandId,
      agentRunId: run.id,
      platform: item.platform as ContentPlatform,
      format: item.format,
      pillarId: item.pillar_id ?? undefined,
      topic: item.title || item.copy.slice(0, 200),
      rejectionReason: item.rejection_reason ?? undefined,
      createdBy: user.id,
      sourceItemId: item.id,
    },
  });

  redirect(`/content/queue?run=${run.id}`);
}

export async function uploadContentItemMedia(
  _prev: ContentActionResult,
  formData: FormData,
): Promise<ContentActionResult> {
  const itemId = String(formData.get("itemId") ?? "");
  const file = formData.get("file");
  if (!itemId || !(file instanceof File) || file.size === 0) {
    return { error: "Choose an image file to upload" };
  }

  try {
    const { active } = await assertCanWrite();
    const supabase = await createClient();
    const { data: item } = await supabase
      .from("content_items")
      .select("id, brand_id, media_urls")
      .eq("id", itemId)
      .eq("organization_id", active.organization_id)
      .single();
    if (!item) return { error: "Item not found" };

    const { uploadContentMediaFile } = await import("@/lib/content/media");
    const uploaded = await uploadContentMediaFile({
      organizationId: active.organization_id,
      brandId: item.brand_id,
      contentItemId: item.id,
      file,
    });

    const existing = (item.media_urls as string[] | null) ?? [];
    const { error } = await supabase
      .from("content_items")
      .update({ media_urls: [...existing, uploaded.publicUrl] })
      .eq("id", itemId)
      .eq("organization_id", active.organization_id);
    if (error) return { error: error.message };

    revalidatePath(`/content/${itemId}`);
    return { success: "Image uploaded" };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

export async function removeContentItemMedia(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "");
  const url = String(formData.get("url") ?? "");
  if (!itemId || !url) throw new Error("Missing media");

  const { active } = await assertCanWrite();
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("content_items")
    .select("media_urls")
    .eq("id", itemId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!item) throw new Error("Item not found");

  const next = ((item.media_urls as string[]) ?? []).filter((u) => u !== url);
  const { error } = await supabase
    .from("content_items")
    .update({ media_urls: next })
    .eq("id", itemId)
    .eq("organization_id", active.organization_id);
  if (error) throw new Error(error.message);
  revalidatePath(`/content/${itemId}`);
}
