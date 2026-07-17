import { createAdminClient } from "@/lib/supabase/admin";
import { generateMeetingForType } from "@/lib/agents/meetings/generate";
import { gatherMeetingContext } from "@/lib/meetings/context";
import { notifyUser } from "@/lib/planning/materialize";
import type {
  Meeting,
  MeetingActionItem,
  MeetingBlocker,
  MeetingDecision,
  MeetingType,
} from "@/lib/types/meetings";
import {
  MEETING_TYPE_LABELS,
} from "@/lib/types/meetings";

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

async function notifyOrgAdmins(params: {
  organizationId: string;
  title: string;
  body: string;
  link: string;
}) {
  const supabase = createAdminClient();
  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", params.organizationId)
    .eq("status", "active")
    .in("role", ["org_owner", "org_admin", "org_member"]);

  for (const m of members ?? []) {
    await notifyUser({
      organizationId: params.organizationId,
      userId: m.user_id,
      title: params.title,
      body: params.body,
      link: params.link,
      category: "meetings",
    });
  }
}

async function persistActions(params: {
  organizationId: string;
  meetingId: string;
  actions: MeetingActionItem[];
}) {
  const supabase = createAdminClient();
  if (!params.actions.length) return;

  await supabase.from("meeting_actions").insert(
    params.actions.map((a, i) => ({
      organization_id: params.organizationId,
      meeting_id: params.meetingId,
      description: a.description,
      owner_type: a.owner_type,
      due_date: a.due_offset_days != null
        ? addDays(todayUtc(), a.due_offset_days)
        : null,
      sort_order: i,
      status: "open" as const,
    })),
  );
}

function extractCommon(data: Record<string, unknown>) {
  const agenda = (data.agenda ?? []) as Meeting["agenda"];
  const decisions = (data.decisions ?? []) as MeetingDecision[];
  const actions = (data.actions ?? []) as MeetingActionItem[];
  const blockers = (data.blockers ?? []) as MeetingBlocker[];
  const minutes =
    typeof data.minutes_markdown === "string" ? data.minutes_markdown : "";
  const title = typeof data.title === "string" ? data.title : "Meeting";
  const executive_summary =
    typeof data.executive_summary === "string" ? data.executive_summary : null;

  // Enrich standup minutes if structured fields present
  let minutesMarkdown = minutes;
  if (data.yesterday || data.today) {
    minutesMarkdown = [
      "## What happened yesterday",
      String(data.yesterday ?? ""),
      "",
      "## What's happening today",
      String(data.today ?? ""),
      "",
      "## Blockers needing human input",
      blockers.length
        ? blockers.map((b) => `- **${b.title}**: ${b.detail}`).join("\n")
        : "- None",
      "",
      minutes ? `---\n\n${minutes}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  // Weekly: weave persona discussion into minutes if thin
  if (
    Array.isArray(data.persona_discussion) &&
    data.persona_discussion.length &&
    !minutes.includes("Head of")
  ) {
    const dialogue = (data.persona_discussion as Array<{ role: string; statement: string }>)
      .map((p) => `**${p.role}:** ${p.statement}`)
      .join("\n\n");
    const priorities = Array.isArray(data.priorities_next_week)
      ? `\n\n## Priorities next week\n${(data.priorities_next_week as string[]).map((p) => `- ${p}`).join("\n")}`
      : "";
    minutesMarkdown = `${minutes}\n\n## Discussion\n\n${dialogue}${priorities}`;
  }

  return {
    title,
    agenda,
    decisions,
    actions,
    blockers,
    minutes_markdown: minutesMarkdown,
    executive_summary,
  };
}

export async function runMeeting(meetingId: string) {
  const supabase = createAdminClient();
  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .single();

  if (error || !meeting) throw new Error(error?.message ?? "Meeting not found");
  const m = meeting as Meeting;

  if (m.status === "complete") return { meetingId, skipped: true as const };

  await supabase
    .from("meetings")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", meetingId);

  const { data: agentRun } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: m.organization_id,
      module: "meetings",
      agent_name: m.type,
      status: "running",
      input: { meeting_id: meetingId, brand_id: m.brand_id, type: m.type },
      progress: 10,
    })
    .select("id")
    .single();

  try {
    const ctx = await gatherMeetingContext({
      organizationId: m.organization_id,
      brandId: m.brand_id,
      type: m.type,
    });

    const result = await generateMeetingForType(m.type, ctx);
    const common = extractCommon(result.data as unknown as Record<string, unknown>);

    await supabase
      .from("meetings")
      .update({
        status: "complete",
        title: common.title || m.title,
        agenda: common.agenda,
        minutes_markdown: common.minutes_markdown,
        executive_summary: common.executive_summary,
        decisions: common.decisions,
        actions: common.actions,
        blockers: common.blockers,
        context_snapshot: ctx.snapshot,
        agent_run_id: agentRun?.id ?? null,
        completed_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", meetingId);

    await persistActions({
      organizationId: m.organization_id,
      meetingId,
      actions: common.actions,
    });

    if (agentRun?.id) {
      await supabase
        .from("agent_runs")
        .update({
          status: "complete",
          output: {
            title: common.title,
            decisions: common.decisions.length,
            actions: common.actions.length,
            blockers: common.blockers.length,
          },
          tokens_in: result.tokensIn,
          tokens_out: result.tokensOut,
          cost_pence: result.costPence,
          progress: 100,
        })
        .eq("id", agentRun.id);
    }

    const humanBlockers = common.blockers.filter((b) => b.needs_human);
    if (humanBlockers.length) {
      await notifyOrgAdmins({
        organizationId: m.organization_id,
        title: `Blockers from ${MEETING_TYPE_LABELS[m.type]}`,
        body: humanBlockers.map((b) => b.title).join("; ").slice(0, 280),
        link: `/meetings/${meetingId}`,
      });
    }

    return {
      meetingId,
      skipped: false as const,
      decisions: common.decisions.length,
      actions: common.actions.length,
      blockers: humanBlockers.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Meeting failed";
    await supabase
      .from("meetings")
      .update({
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", meetingId);

    if (agentRun?.id) {
      await supabase
        .from("agent_runs")
        .update({
          status: "failed",
          error: message,
          progress: 100,
        })
        .eq("id", agentRun.id);
    }
    throw err;
  }
}

export async function createAndQueueMeeting(params: {
  organizationId: string;
  brandId: string;
  type: MeetingType;
  scheduledFor?: string;
  title?: string;
}) {
  const supabase = createAdminClient();
  const scheduledFor = params.scheduledFor ?? new Date().toISOString();
  const title =
    params.title ??
    `${MEETING_TYPE_LABELS[params.type]} — ${new Date(scheduledFor).toISOString().slice(0, 10)}`;

  const { data, error } = await supabase
    .from("meetings")
    .insert({
      organization_id: params.organizationId,
      brand_id: params.brandId,
      type: params.type,
      title,
      scheduled_for: scheduledFor,
      status: "scheduled",
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create meeting");
  return data as Meeting;
}
