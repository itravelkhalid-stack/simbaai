"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

import { inngest } from "@/lib/inngest/client";
import { assertPlanAllows } from "@/lib/billing/plans";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { createAndQueueMeeting } from "@/lib/meetings/run";
import { parseMeetingsSettings } from "@/lib/meetings/settings";
import { logCampaignActivity } from "@/lib/planning/materialize";
import { MEETING_TYPE_LABELS } from "@/lib/types/meetings";

export type MeetingsActionResult = { error?: string; success?: string };

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot modify meetings");
  }
  return ctx;
}

const scheduleTypeSchema = z.enum([
  "daily_standup",
  "weekly_marketing",
  "monthly_board",
  "quarterly_board",
  "annual_review",
  "adhoc",
]);

export async function saveMeetingsSettings(
  _prev: MeetingsActionResult,
  formData: FormData,
): Promise<MeetingsActionResult> {
  try {
    const { active } = await assertCanWrite();
    if (active.role !== "org_owner" && active.role !== "org_admin") {
      return { error: "Only owners/admins can change meeting schedule settings" };
    }
    const supabase = await createClient();
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", active.organization_id)
      .single();
    const settings = (org?.settings ?? {}) as Record<string, unknown>;
    const next = {
      ...settings,
      meetings: {
        timezone: String(formData.get("timezone") ?? "Europe/London").trim() ||
          "Europe/London",
        daily_standup_enabled: formData.get("dailyEnabled") === "on",
        daily_standup_hour: Number(formData.get("dailyHour") ?? 7),
        weekly_marketing_enabled: formData.get("weeklyEnabled") === "on",
        weekly_marketing_weekday: Number(formData.get("weeklyWeekday") ?? 1),
        weekly_marketing_hour: Number(formData.get("weeklyHour") ?? 8),
        monthly_board_enabled: formData.get("monthlyEnabled") === "on",
        monthly_board_day: Number(formData.get("monthlyDay") ?? 1),
        monthly_board_hour: Number(formData.get("monthlyHour") ?? 9),
        quarterly_board_enabled: formData.get("quarterlyEnabled") === "on",
        quarterly_board_hour: Number(formData.get("quarterlyHour") ?? 9),
        annual_review_enabled: formData.get("annualEnabled") === "on",
        annual_review_hour: Number(formData.get("annualHour") ?? 9),
      },
    };
    const { error } = await supabase
      .from("organizations")
      .update({ settings: next })
      .eq("id", active.organization_id);
    if (error) return { error: error.message };
    revalidatePath("/meetings/settings");
    return { success: "Meeting schedule saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function runMeetingNow(
  _prev: MeetingsActionResult,
  formData: FormData,
): Promise<MeetingsActionResult> {
  try {
    const { active } = await assertCanWrite();
    await assertPlanAllows(active.organization_id, "ai_runs_month");
    const type = scheduleTypeSchema.parse(String(formData.get("type") ?? "adhoc"));
    const brandId = String(formData.get("brandId") ?? "");
    if (!brandId) return { error: "Select a brand" };

    const meeting = await createAndQueueMeeting({
      organizationId: active.organization_id,
      brandId,
      type,
      title:
        type === "adhoc"
          ? String(formData.get("title") ?? "").trim() ||
            `${MEETING_TYPE_LABELS[type]} — ${new Date().toISOString().slice(0, 10)}`
          : undefined,
    });

    await inngest.send({
      name: "meetings/run",
      data: { meetingId: meeting.id },
    });

    revalidatePath("/meetings");
    return { success: `Queued ${MEETING_TYPE_LABELS[type]}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function addMeetingComment(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const meetingId = String(formData.get("meetingId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!meetingId || !body) return;

  const supabase = await createClient();
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id")
    .eq("id", meetingId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!meeting) return;

  await supabase.from("meeting_comments").insert({
    organization_id: active.organization_id,
    meeting_id: meetingId,
    user_id: user.id,
    body,
  });
  revalidatePath(`/meetings/${meetingId}`);
}

export async function convertActionToTask(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const actionId = String(formData.get("actionId") ?? "");
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!actionId) return;

  const supabase = await createClient();
  const { data: action } = await supabase
    .from("meeting_actions")
    .select("*")
    .eq("id", actionId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!action) return;
  if (action.linked_task_id) return;

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, brand_id, title")
    .eq("id", action.meeting_id)
    .single();
  if (!meeting) return;

  let targetCampaignId = campaignId;
  if (!targetCampaignId) {
    const { data: existing } = await supabase
      .from("campaigns")
      .select("id")
      .eq("organization_id", active.organization_id)
      .eq("brand_id", meeting.brand_id)
      .in("status", ["active", "planned", "paused"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    targetCampaignId = existing?.id ?? "";
  }

  if (!targetCampaignId) {
    const { data: created, error } = await supabase
      .from("campaigns")
      .insert({
        organization_id: active.organization_id,
        brand_id: meeting.brand_id,
        name: "Meeting follow-ups",
        goal: "Actions converted from AI meetings",
        status: "active",
        channels: ["other"],
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "No campaign");
    targetCampaignId = created.id;
  }

  const { data: task, error: taskError } = await supabase
    .from("campaign_tasks")
    .insert({
      organization_id: active.organization_id,
      campaign_id: targetCampaignId,
      title: action.description.slice(0, 120),
      description: `From meeting: ${meeting.title}\n\n${action.description}`,
      module: "other",
      assignee_type: action.owner_type === "ai" ? "ai" : "human",
      assignee_id: action.owner_id,
      status: "todo",
      due_date: action.due_date,
      linked_entity: { meeting_id: meeting.id, meeting_action_id: action.id },
    })
    .select("id")
    .single();

  if (taskError || !task) throw new Error(taskError?.message ?? "Task create failed");

  await supabase
    .from("meeting_actions")
    .update({ linked_task_id: task.id, status: "in_progress" })
    .eq("id", action.id);

  await logCampaignActivity({
    organizationId: active.organization_id,
    campaignId: targetCampaignId,
    taskId: task.id,
    actorType: "human",
    actorId: user.id,
    message: `Task created from meeting action`,
    meta: { meeting_id: meeting.id, action_id: action.id },
  });

  revalidatePath(`/meetings/${meeting.id}`);
  revalidatePath(`/planning/campaigns/${targetCampaignId}`);
}

export async function askAboutMeeting(
  _prev: MeetingsActionResult & { reply?: string },
  formData: FormData,
): Promise<MeetingsActionResult & { reply?: string }> {
  try {
    const { user, active } = await assertCanWrite();
    const meetingId = String(formData.get("meetingId") ?? "");
    const question = String(formData.get("question") ?? "").trim();
    if (!meetingId || !question) return { error: "Ask a question" };

    const supabase = await createClient();
    const { data: meeting } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .eq("organization_id", active.organization_id)
      .single();
    if (!meeting) return { error: "Meeting not found" };

    await supabase.from("meeting_chat_messages").insert({
      organization_id: active.organization_id,
      meeting_id: meetingId,
      user_id: user.id,
      role: "user",
      content: question,
    });

    const { data: history } = await supabase
      .from("meeting_chat_messages")
      .select("role, content")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true })
      .limit(40);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { error: "ANTHROPIC_API_KEY is not configured" };

    const anthropic = new Anthropic({ apiKey });
    const model =
      process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

    const contextBlock = `
Meeting type: ${meeting.type}
Title: ${meeting.title}
Scheduled: ${meeting.scheduled_for}
Status: ${meeting.status}

Executive summary:
${meeting.executive_summary ?? "(none)"}

Minutes:
${(meeting.minutes_markdown ?? "").slice(0, 12000)}

Decisions:
${JSON.stringify(meeting.decisions ?? [], null, 2)}

Actions:
${JSON.stringify(meeting.actions ?? [], null, 2)}

Blockers:
${JSON.stringify(meeting.blockers ?? [], null, 2)}

Context snapshot (truncated):
${JSON.stringify(meeting.context_snapshot ?? {}, null, 2).slice(0, 8000)}
`.trim();

    const messages = (history ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const response = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: `You are GrowthOS meeting analyst. Answer only using the meeting record and its context. If something isn't in the record, say so briefly.\n\n${contextBlock}`,
      messages:
        messages.length > 0
          ? messages
          : [{ role: "user", content: question }],
    });

    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();

    await supabase.from("meeting_chat_messages").insert({
      organization_id: active.organization_id,
      meeting_id: meetingId,
      user_id: null,
      role: "assistant",
      content: reply || "I couldn't generate a reply.",
    });

    revalidatePath(`/meetings/${meetingId}`);
    return { success: "Answered", reply };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Chat failed" };
  }
}

export async function getParsedMeetingsSettings(organizationId: string) {
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .single();
  return parseMeetingsSettings(org?.settings as Record<string, unknown>);
}
