import { createAdminClient } from "@/lib/supabase/admin";
import { generateMeetingForType } from "@/lib/agents/meetings/generate";
import { gatherMeetingContext } from "@/lib/meetings/context";
import { evaluateWeeklyKpiEscalation } from "@/lib/meetings/escalation";
import { executeMeetingActions } from "@/lib/meetings/execute-actions";
import { notifyUser } from "@/lib/planning/materialize";
import type {
  Meeting,
  MeetingActionItem,
  MeetingActionOutcome,
  MeetingBlocker,
  MeetingDecision,
  MeetingType,
} from "@/lib/types/meetings";
import { MEETING_TYPE_LABELS } from "@/lib/types/meetings";

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
      due_date:
        a.due_offset_days != null ? addDays(todayUtc(), a.due_offset_days) : null,
      sort_order: i,
      status: "open" as const,
      action_type: a.action_type ?? "note",
      payload: a.payload ?? {},
      execution_status: "pending" as const,
    })),
  );
}

function appendActionsSections(
  minutes: string,
  taken: MeetingActionOutcome[],
  awaiting: MeetingActionOutcome[],
) {
  const takenMd = taken.length
    ? taken
        .map(
          (a) =>
            `- **[${a.action_type}]** ${a.description}${a.detail ? ` — ${a.detail}` : ""}`,
        )
        .join("\n")
    : "- None executed automatically";
  const awaitingMd = awaiting.length
    ? awaiting
        .map(
          (a) =>
            `- **[${a.action_type} / ${a.status}]** ${a.description}${a.detail ? ` — ${a.detail}` : ""}`,
        )
        .join("\n")
    : "- None awaiting approval";

  const stripped = minutes
    .replace(/## Actions taken[\s\S]*?(?=## |$)/gi, "")
    .replace(/## Actions awaiting approval[\s\S]*?(?=## |$)/gi, "")
    .trim();

  return `${stripped}

## Actions taken
${takenMd}

## Actions awaiting approval
${awaitingMd}
`.trim();
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

  if (
    Array.isArray(data.persona_discussion) &&
    data.persona_discussion.length &&
    !minutes.includes("Head of")
  ) {
    const dialogue = (
      data.persona_discussion as Array<{ role: string; statement: string }>
    )
      .map((p) => `**${p.role}:** ${p.statement}`)
      .join("\n\n");
    const priorities = Array.isArray(data.priorities_next_week)
      ? `\n\n## Priorities next week\n${(data.priorities_next_week as string[]).map((p) => `- ${p}`).join("\n")}`
      : "";
    minutesMarkdown = `${minutes}\n\n## Discussion\n\n${dialogue}${priorities}`;
  }

  if (typeof data.year_in_review === "string" && data.year_in_review) {
    minutesMarkdown = [
      minutes,
      "",
      "## Year in review",
      data.year_in_review,
      Array.isArray(data.strategic_recommendations_next_year)
        ? `\n## Next-year recommendations\n${(data.strategic_recommendations_next_year as string[]).map((r) => `- ${r}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
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

export async function runMeeting(meetingId: string): Promise<{
  meetingId: string;
  skipped?: boolean;
  retry?: boolean;
  permanentlyFailed?: boolean;
  error?: string;
  decisions?: number;
  actions?: number;
  blockers?: number;
  executed?: number;
  awaiting?: number;
  escalated?: boolean;
}> {
  const supabase = createAdminClient();
  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .single();

  if (error || !meeting) throw new Error(error?.message ?? "Meeting not found");
  const m = meeting as Meeting;

  if (m.status === "complete") return { meetingId, skipped: true as const };

  const priorAttempts = m.generation_attempts ?? 0;

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
      input: {
        meeting_id: meetingId,
        brand_id: m.brand_id,
        type: m.type,
        attempt: priorAttempts + 1,
      },
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
    const setupBlockers = (
      (ctx.snapshot.setup_blockers as MeetingBlocker[] | undefined) ?? []
    ).map((b) => ({
      title: b.title,
      detail: b.detail,
      needs_human: true,
    }));
    const blockerTitles = new Set(
      common.blockers.map((b) => b.title.toLowerCase()),
    );
    const mergedBlockers = [
      ...common.blockers,
      ...setupBlockers.filter((b) => !blockerTitles.has(b.title.toLowerCase())),
    ];
    common.blockers = mergedBlockers;

    await persistActions({
      organizationId: m.organization_id,
      meetingId,
      actions: common.actions,
    });

    const { taken, awaiting } = await executeMeetingActions({
      organizationId: m.organization_id,
      brandId: m.brand_id,
      meetingId,
      actions: common.actions,
    });

    let minutes = appendActionsSections(
      common.minutes_markdown,
      taken,
      awaiting,
    );
    if (ctx.dataSparse || ctx.notConnectedSources.length) {
      const parts = [
        ctx.notConnectedSources.length
          ? `Not connected: ${ctx.notConnectedSources.join(", ")}`
          : null,
        ctx.connectedEmptySources.length
          ? `Connected but empty/zero: ${ctx.connectedEmptySources.join(", ")}`
          : null,
      ].filter(Boolean);
      const banner = `> **Sparse data notice:** ${parts.join(" · ") || "incomplete context"}. Do not treat NOT CONNECTED sources as performance failures.\n\n`;
      if (!minutes.includes("Sparse data notice")) {
        minutes = banner + minutes;
      }
    }

    let escalated = false;
    if (m.type === "weekly_marketing") {
      const variances = (
        (ctx.snapshot.brand_kpis as Array<{
          metric_key: string;
          label: string;
          variance_pct: number | null;
        }>) ?? []
      );
      const esc = await evaluateWeeklyKpiEscalation({
        organizationId: m.organization_id,
        brandId: m.brand_id,
        meetingId,
        currentVariances: variances,
      });
      escalated = esc.escalated;
      if (escalated) {
        minutes += `\n\n## Escalation\nKPI(s) >25% off target for two consecutive weekly meetings: ${esc.metrics.join(", ")}. Org admins have been notified.\n`;
      }
    }

    await supabase
      .from("meetings")
      .update({
        status: "complete",
        title: common.title || m.title,
        agenda: common.agenda,
        minutes_markdown: minutes,
        executive_summary: common.executive_summary,
        decisions: common.decisions,
        actions: common.actions,
        blockers: common.blockers,
        context_snapshot: ctx.snapshot,
        actions_taken: taken,
        actions_awaiting_approval: awaiting,
        escalation_flagged: escalated,
        generation_attempts: priorAttempts + 1,
        agent_run_id: agentRun?.id ?? null,
        completed_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", meetingId);

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
            executed: taken.length,
            awaiting: awaiting.length,
            escalated,
            empty_sources: ctx.emptySources,
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

    await notifyOrgAdmins({
      organizationId: m.organization_id,
      title: `${MEETING_TYPE_LABELS[m.type]} ready`,
      body: `${common.decisions.length} decisions, ${taken.length} actions taken, ${awaiting.length} awaiting approval`,
      link: `/meetings/${meetingId}`,
    });

    return {
      meetingId,
      skipped: false as const,
      decisions: common.decisions.length,
      actions: common.actions.length,
      blockers: humanBlockers.length,
      executed: taken.length,
      awaiting: awaiting.length,
      escalated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Meeting failed";
    const attempts = priorAttempts + 1;
    const canSoftRetry = attempts < 2;

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

    if (canSoftRetry) {
      // Soft-fail: leave scheduled so a 15m delayed retry can re-run.
      // Does not consume the day slot as "complete", but blocks duplicate creates.
      await supabase
        .from("meetings")
        .update({
          status: "scheduled",
          generation_attempts: attempts,
          error: `Attempt ${attempts} failed (will retry once): ${message}`,
          completed_at: null,
        })
        .eq("id", meetingId);

      return {
        meetingId,
        retry: true,
        error: message,
      };
    }

    await supabase
      .from("meetings")
      .update({
        status: "failed",
        generation_attempts: attempts,
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", meetingId);

    await notifyOrgAdmins({
      organizationId: m.organization_id,
      title: `${MEETING_TYPE_LABELS[m.type]} failed`,
      body: `Generation failed permanently after ${attempts} attempts: ${message}`.slice(
        0,
        280,
      ),
      link: `/meetings/${meetingId}`,
    });

    return {
      meetingId,
      permanentlyFailed: true,
      error: message,
    };
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
