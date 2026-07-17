import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { MeetingChat } from "@/components/meetings/meeting-chat";
import { MeetingsNav } from "@/components/meetings/meetings-nav";
import {
  addMeetingComment,
  convertActionToTask,
} from "@/lib/meetings/actions";
import { Button } from "@/components/ui/button";
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
        <p className="text-muted-foreground">Meeting not found.</p>
        <Link href="/meetings" className="underline">
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
    supabase.from("brands").select("name").eq("id", m.brand_id).maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/meetings" className="text-sm text-muted-foreground underline">
          ← Meetings
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{m.title}</h1>
        <p className="mt-2 text-muted-foreground">
          {MEETING_TYPE_LABELS[m.type]} · {brand?.name ?? "Brand"} ·{" "}
          {new Date(m.scheduled_for).toLocaleString()} · {m.status}
        </p>
      </div>
      <MeetingsNav current="/meetings" />

      {m.error ? (
        <div className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
          {m.error}
        </div>
      ) : null}

      {m.executive_summary ? (
        <section className="rounded-xl border p-4">
          <h2 className="mb-2 text-sm font-medium">Executive summary</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {m.executive_summary}
          </p>
        </section>
      ) : null}

      {(m.blockers ?? []).length ? (
        <section className="rounded-xl border border-amber-500/30 p-4">
          <h2 className="mb-2 text-sm font-medium">Blockers</h2>
          <ul className="space-y-2 text-sm">
            {m.blockers.map((b, i) => (
              <li key={i}>
                <span className="font-medium">{b.title}</span>
                {b.needs_human ? (
                  <span className="ml-2 text-xs text-amber-700">needs human</span>
                ) : null}
                <p className="text-muted-foreground">{b.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border p-4">
        <h2 className="mb-3 text-sm font-medium">Minutes</h2>
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {m.minutes_markdown || "_Minutes not generated yet._"}
          </ReactMarkdown>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border p-4">
          <h2 className="mb-3 text-sm font-medium">Decisions</h2>
          {(m.decisions ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">None recorded.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {m.decisions.map((d, i) => (
                <li key={i}>
                  <p className="font-medium">{d.title}</p>
                  <p className="text-muted-foreground">{d.rationale}</p>
                  {d.owner ? (
                    <p className="text-xs text-muted-foreground">Owner: {d.owner}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border p-4">
          <h2 className="mb-3 text-sm font-medium">Actions</h2>
          {((actions ?? []) as MeetingAction[]).length === 0 ? (
            <p className="text-sm text-muted-foreground">None recorded.</p>
          ) : (
            <ul className="space-y-3">
              {((actions ?? []) as MeetingAction[]).map((a) => (
                <li key={a.id} className="rounded-lg border p-3 text-sm">
                  <p>{a.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.owner_type} · {a.status}
                    {a.due_date ? ` · due ${a.due_date}` : ""}
                  </p>
                  {a.linked_task_id ? (
                    <Link
                      href={`/planning/campaigns`}
                      className="mt-2 inline-block text-xs underline"
                    >
                      Linked to campaign task
                    </Link>
                  ) : (
                    <form action={convertActionToTask} className="mt-2 flex flex-wrap gap-2">
                      <input type="hidden" name="actionId" value={a.id} />
                      <select
                        name="campaignId"
                        className="h-8 rounded-md border bg-transparent px-2 text-xs"
                        defaultValue=""
                      >
                        <option value="">Auto-pick campaign</option>
                        {((campaigns ?? []) as Pick<Campaign, "id" | "name">[]).map(
                          (c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ),
                        )}
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

      <MeetingChat
        meetingId={meetingId}
        messages={(chat ?? []) as MeetingChatMessage[]}
      />

      <section className="rounded-xl border p-4">
        <h2 className="mb-3 text-sm font-medium">Comments</h2>
        <ul className="mb-4 space-y-2 text-sm">
          {((comments ?? []) as MeetingComment[]).length === 0 ? (
            <li className="text-muted-foreground">No comments yet.</li>
          ) : (
            ((comments ?? []) as MeetingComment[]).map((c) => (
              <li key={c.id} className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="whitespace-pre-wrap">{c.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleString()}
                </p>
              </li>
            ))
          )}
        </ul>
        <form action={addMeetingComment} className="flex gap-2">
          <input type="hidden" name="meetingId" value={meetingId} />
          <input
            name="body"
            placeholder="Add a comment…"
            className="flex h-9 flex-1 rounded-md border bg-transparent px-3 text-sm"
            required
          />
          <Button type="submit" variant="outline">
            Comment
          </Button>
        </form>
      </section>
    </div>
  );
}
