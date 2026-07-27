"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  sendAskMessage,
  type AskActionResult,
} from "@/lib/team/ask/actions";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  department: string | null;
};

const initial: AskActionResult = {};

export function AskChat({
  conversationId,
  brandId,
  brands,
  messages,
}: {
  conversationId: string | null;
  brandId: string;
  brands: Array<{ id: string; name: string }>;
  messages: Message[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(sendAskMessage, initial);
  const bottomRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, state.answer]);

  useEffect(() => {
    if (state.conversationId && state.conversationId !== conversationId) {
      router.push(`/ask?c=${state.conversationId}`);
    }
    if (state.answer) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.conversationId, state.answer, conversationId, router]);

  return (
    <div className="flex min-h-[70vh] flex-col overflow-hidden rounded-lg bg-card shadow-elevated ring-1 ring-border">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 && !state.answer ? (
          <div className="space-y-3 py-12 text-center">
            <p className="font-heading text-lg font-semibold text-ink">
              Ask the Team
            </p>
            <p className="mx-auto max-w-md text-sm text-ink-soft">
              Route a question to the right department — ads, content, finance,
              meetings, compliance, and more. Actions respect autonomy mode.
            </p>
          </div>
        ) : null}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {state.answer &&
        !messages.some((m) => m.content === state.answer) ? (
          <MessageBubble
            message={{
              id: "pending",
              role: "assistant",
              content: state.answer,
              department: state.department ?? null,
            }}
          />
        ) : null}

        {state.error ? (
          <div className="space-y-2">
            <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {state.error}
            </p>
            {state.upgradeHref ? (
              <a
                href={state.upgradeHref}
                className="text-sm font-medium underline"
              >
                View plans & upgrade
              </a>
            ) : null}
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        ref={formRef}
        action={action}
        className="border-t border-border bg-surface-soft p-4"
      >
        {conversationId ? (
          <input type="hidden" name="conversationId" value={conversationId} />
        ) : null}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="text-xs text-ink-soft" htmlFor="ask-brand">
            Brand
          </label>
          <select
            id="ask-brand"
            name="brandId"
            required
            defaultValue={brandId}
            className="h-8 rounded-full border border-border bg-card px-3 text-sm"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <textarea
            name="question"
            required
            rows={2}
            disabled={pending}
            placeholder="e.g. How did Meta spend last week vs target?"
            className="min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
          <Button type="submit" disabled={pending} className="self-end">
            {pending ? "Thinking…" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] space-y-2 rounded-2xl px-4 py-3 text-sm",
          isUser
            ? "bg-brand text-primary-foreground"
            : "bg-highlight text-ink",
        )}
      >
        {!isUser && message.department ? (
          <Badge variant="ai">{message.department}</Badge>
        ) : null}
        <div className="whitespace-pre-wrap leading-relaxed">
          {message.content}
        </div>
      </div>
    </div>
  );
}
