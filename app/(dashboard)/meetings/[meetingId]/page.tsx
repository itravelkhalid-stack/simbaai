import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AiContentSurface } from "@/components/brand/ai-content";
import {
  ActionChecklist,
  DecisionCallout,
} from "@/components/meetings/meeting-callouts";
import { MeetingChat } from "@/components/meetings/meeting-chat";
import { MeetingExportButton } from "@/components/meetings/meeting-export-button";
import { MeetingsNav } from "@/components/meetings/meetings-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addMeetingComment,
  convertActionToTask,
} from "@/lib/meetings/actions";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import {
  MEETING_TYPE_LABELS,
  type Meeting,
  type MeetingAction,
  type MeetingChatMessage,
  type MeetingComment,
} from "@/lib/types/meetings";
import type { Campaign } from "@/lib/types/planning";
import { statusTone } from "@/lib/ui/status";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .eq("organization_id", active.organization_id)
    .single();

  if (!meeting) {
    return (
      <div className="space-y-4">
        <p className="text-ink-soft">Meeting not found.</p>
        <Link href="/meetings" className="text-primary underline">
          Back to feed
        </Link>
      </div>
    );
  }

  const m = meeting as Meeting;

  const [
    { data: actions },
    { data: comments },
    { data: chat },
    { data: campaigns },
    { data: brand },
  ] = await Promise.all([
    supabase
      .from("meeting_actions")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("meeting_comments")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true }),
    supabase
      .from("meeting_chat_messages")
      .select("*")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true }),
    supabase
      .from("campaigns")
      .select("id, name, status")
      .eq("organization_id", active.organization_id)
      .eq("brand_id", m.brand_id)
      .in("status", ["active", "planned", "paused"])
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("brands")
      .select("name, primary_color, logo_url")
      .eq("id", m.brand_id)
      .maybeSingle(),
  ]);

  const actionRows = (actions ?? []) as MeetingAction[];

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/meetings"
            className="text-sm font-medium text-primary transition-colors duration-150 hover:underline"
          >
            ← Meetings
          </Link>
          <MeetingExportButton
            meeting={m}
            actions={actionRows}
            brandName={brand?.name ?? "Brand"}
            primaryColor={brand?.primary_color}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="ai">{MEETING_TYPE_LABELS[m.type]}</Badge>
          <Badge variant={statusTone(m.status)}>{m.status}</Badge>
          {m.escalation_flagged ? (
            <Badge variant="danger">Escalation</Badge>
          ) : null}
        </div>
        <h1 className="font-heading text-[28px] font-bold tracking-tight text-ink">
          {m.title}
        </h1>
        <p className="text-sm text-ink-soft">
          {brand?.name ?? "Brand"} ·{" "}
          {new Date(m.scheduled_for).toLocaleString(undefined, {
            dateStyle: "full",
            timeStyle: "short",
          })}
        </p>
      </div>
      <MeetingsNav current="/meetings" />

      {m.error ? (
        <div className="rounded-lg bg-danger-soft p-4 text-sm text-danger ring-1 ring-danger/30">
          {m.error}
        </div>
      ) : null}

      {m.executive_summary ? (
        <section className="max-w-[65ch] rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border">
          <h2 className="font-heading text-base font-semibold text-ink">
            Executive summary
          </h2>
          <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
            {m.executive_summary}
          </p>
        </section>
      ) : null}

      {(m.blockers ?? []).length ? (
        <section className="rounded-lg bg-warning-soft p-5 ring-1 ring-warning/40">
          <h2 className="font-heading text-base font-semibold text-ink">
            Blockers
          </h2>
          <ul className="mt-3 space-y-3">
            {m.blockers.map((b, i) => (
              <li key={i}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-ink">{b.title}</p>
                  {b.needs_human ? (
                    <Badge variant="warning">needs human</Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-ink-soft">{b.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-ink">Minutes</h2>
        <AiContentSurface>
          <div className="prose prose-neutral max-w-[65ch] prose-headings:font-heading prose-headings:text-ink prose-p:text-ink prose-li:text-ink prose-a:text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {m.minutes_markdown || "_Minutes not generated yet._"}
            </ReactMarkdown>
          </div>
        </AiContentSurface>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-ink">
            Decisions
          </h2>
          {(m.decisions ?? []).length === 0 ? (
            <p className="text-sm text-ink-soft">None recorded.</p>
          ) : (
            <ul className="space-y-3">
              {(m.decisions ?? []).map((d, i) => (
                <li key={i}>
                  <DecisionCallout decision={d} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-base font-semibold text-ink">
            Action items
          </h2>
          {actionRows.length === 0 ? (
            <p className="text-sm text-ink-soft">None recorded.</p>
          ) : (
            <ul className="space-y-3">
              {actionRows.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg bg-brand-soft/70 p-4 ring-1 ring-brand/20"
                >
                  <p className="text-sm font-medium text-ink">{a.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="neutral">{a.action_type ?? "note"}</Badge>
                    <Badge variant={statusTone(a.status)}>{a.status}</Badge>
                    <span className="text-xs text-ink-soft">
                      {a.owner_type}
                      {a.due_date ? ` · due ${a.due_date}` : ""}
                    </span>
                  </div>
                  {a.execution_result ? (
                    <p className="mt-2 text-xs text-ink-soft">
                      {a.execution_result}
                    </p>
                  ) : null}
                  {a.linked_task_id ? (
                    <Link
                      href="/planning/campaigns"
                      className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                    >
                      Linked to campaign task
                    </Link>
                  ) : (
                    <form
                      action={convertActionToTask}
                      className="mt-3 flex flex-wrap gap-2"
                    >
                      <input type="hidden" name="actionId" value={a.id} />
                      <select
                        name="campaignId"
                        className="h-8 rounded-md border border-border bg-surface px-2 text-xs"
                        defaultValue=""
                      >
                        <option value="">Auto-pick campaign</option>
                        {(
                          (campaigns ?? []) as Pick<Campaign, "id" | "name">[]
                        ).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" size="xs" variant="outline">
                        Convert to task
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ActionChecklist
          title="Actions taken"
          items={m.actions_taken ?? []}
          empty="None executed."
          checked
        />
        <ActionChecklist
          title="Actions awaiting approval"
          items={m.actions_awaiting_approval ?? []}
          empty="None awaiting."
        />
      </div>

      {m.escalation_flagged ? (
        <section className="rounded-lg bg-danger-soft p-5 text-sm ring-1 ring-danger/30">
          <h2 className="font-heading font-semibold text-danger">Escalation</h2>
          <p className="mt-1 text-ink-soft">
            One or more KPIs were more than 25% off target for two consecutive
            weekly meetings. Org admins were notified.
          </p>
        </section>
      ) : null}

      <MeetingChat
        meetingId={meetingId}
        messages={(chat ?? []) as MeetingChatMessage[]}
      />

      <section className="rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border">
        <h2 className="font-heading text-base font-semibold text-ink">
          Comments
        </h2>
        <ul className="mt-4 space-y-2">
          {((comments ?? []) as MeetingComment[]).length === 0 ? (
            <li className="text-sm text-ink-soft">No comments yet.</li>
          ) : (
            ((comments ?? []) as MeetingComment[]).map((c) => (
              <li key={c.id} className="rounded-lg bg-muted px-3 py-2 text-sm">
                <p className="whitespace-pre-wrap text-ink">{c.body}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {new Date(c.created_at).toLocaleString()}
                </p>
              </li>
            ))
          )}
        </ul>
        <form action={addMeetingComment} className="mt-4 flex gap-2">
          <input type="hidden" name="meetingId" value={meetingId} />
          <Input name="body" placeholder="Add a comment…" required className="flex-1" />
          <Button type="submit" variant="outline">
            Comment
          </Button>
        </form>
      </section>
    </div>
  );
}
