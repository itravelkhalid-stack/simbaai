import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { AskChat } from "@/components/team/ask-chat";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: conversationId } = await searchParams;
  const { user, active } = await requireActiveOrg();
  const supabase = await createClient();

  const [{ data: brands }, { data: conversations }] = await Promise.all([
    supabase
      .from("brands")
      .select("id, name")
      .eq("organization_id", active.organization_id)
      .order("name"),
    supabase
      .from("team_ask_conversations")
      .select("id, title, updated_at")
      .eq("organization_id", active.organization_id)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(30),
  ]);

  const brandList = brands ?? [];
  const defaultBrandId = brandList[0]?.id ?? "";

  let messages: Array<{
    id: string;
    role: "user" | "assistant" | "tool";
    content: string;
    department: string | null;
  }> = [];
  let activeBrandId = defaultBrandId;

  if (conversationId) {
    const { data: conv } = await supabase
      .from("team_ask_conversations")
      .select("id, brand_id")
      .eq("id", conversationId)
      .eq("organization_id", active.organization_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (conv) {
      activeBrandId = (conv.brand_id as string) || defaultBrandId;
      const { data: rows } = await supabase
        .from("team_ask_messages")
        .select("id, role, content, department")
        .eq("conversation_id", conversationId)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true });
      messages = (rows ?? []).map((r) => ({
        id: r.id as string,
        role: r.role as "user" | "assistant" | "tool",
        content: r.content as string,
        department: (r.department as string | null) ?? null,
      }));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ask the Team"
        description="Claude routes your question to the right department with live data tools. Actions go through autonomy and approvals."
        actions={
          <Link href="/team" className={cn(buttonVariants({ variant: "outline" }))}>
            AI Team
          </Link>
        }
      />

      {!defaultBrandId ? (
        <p className="rounded-lg bg-card p-5 text-sm text-ink-soft shadow-elevated ring-1 ring-border">
          Create a brand first to ask the team.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <aside className="space-y-2">
            <Link
              href="/ask"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "w-full",
              )}
            >
              New chat
            </Link>
            <ul className="space-y-1">
              {(conversations ?? []).map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/ask?c=${c.id}`}
                    className={cn(
                      "block truncate rounded-md px-3 py-2 text-sm",
                      c.id === conversationId
                        ? "bg-brand-soft font-medium text-primary"
                        : "text-ink-soft hover:bg-surface hover:text-ink",
                    )}
                  >
                    {c.title || "Untitled"}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
          <AskChat
            conversationId={conversationId ?? null}
            brandId={activeBrandId}
            brands={brandList}
            messages={messages}
          />
        </div>
      )}
    </div>
  );
}
