"use client";

import { useActionState } from "react";

import {
  askAboutMeeting,
  type MeetingsActionResult,
} from "@/lib/meetings/actions";
import type { MeetingChatMessage } from "@/lib/types/meetings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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
    <div className="space-y-3 rounded-xl border p-4">
      <p className="text-sm font-medium">Ask about this meeting</p>
      <div className="max-h-72 space-y-2 overflow-y-auto text-sm">
        {messages.length === 0 ? (
          <p className="text-muted-foreground">
            Ask anything grounded in this meeting&apos;s minutes, decisions, and data.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "rounded-lg bg-muted/60 px-3 py-2"
                  : "rounded-lg border px-3 py-2"
              }
            >
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {m.role === "user" ? "You" : "Analyst"}
              </p>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))
        )}
      </div>
      <form action={action} className="flex gap-2">
        <input type="hidden" name="meetingId" value={meetingId} />
        <input
          name="question"
          placeholder="What were the blockers?"
          className="flex h-9 flex-1 rounded-md border bg-transparent px-3 text-sm"
          required
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
