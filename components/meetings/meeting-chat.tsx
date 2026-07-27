"use client";

import { useActionState } from "react";

import {
  askAboutMeeting,
  type MeetingsActionResult,
} from "@/lib/meetings/actions";
import type { MeetingChatMessage } from "@/lib/types/meetings";
import { SimbaBadge } from "@/components/brand/ai-content";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const initial: MeetingsActionResult & { reply?: string } = {};

export function MeetingChat({
  meetingId,
  messages,
}: {
  meetingId: string;
  messages: MeetingChatMessage[];
}) {
  const [state, action, pending] = useActionState(askAboutMeeting, initial);

  return (
    <div className="space-y-4 rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-base font-semibold text-ink">
          Ask about this meeting
        </h2>
        <SimbaBadge />
      </div>
      <div className="max-h-80 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Ask anything grounded in this meeting&apos;s minutes, decisions, and
            data.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "rounded-lg px-3 py-2.5 text-sm",
                m.role === "user"
                  ? "ml-6 bg-muted text-ink"
                  : "mr-6 bg-highlight text-ink",
              )}
            >
              <p className="mb-1 text-[11px] font-medium tracking-wide text-ink-soft uppercase">
                {m.role === "user" ? "You" : "Simba"}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
            </div>
          ))
        )}
      </div>
      <form action={action} className="flex gap-2">
        <input type="hidden" name="meetingId" value={meetingId} />
        <Input
          name="question"
          placeholder="What were the blockers?"
          required
          className="flex-1"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "…" : "Ask"}
        </Button>
      </form>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
