"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertPlanAllows } from "@/lib/billing/plans";
import { requireActiveOrg } from "@/lib/org/require";
import { assertAskRateLimit, runTeamAsk } from "@/lib/team/ask/runner";
import { createClient } from "@/lib/supabase/server";

export type AskActionResult = {
  error?: string;
  conversationId?: string;
  answer?: string;
  department?: string;
  actionsSummary?: Array<{
    action: string;
    status: string;
    detail: string;
  }>;
};

async function assertCanAsk() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot use Ask the Team");
  }
  return ctx;
}

const sendSchema = z.object({
  question: z.string().trim().min(2).max(4000),
  brandId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
});

export async function sendAskMessage(
  _prev: AskActionResult,
  formData: FormData,
): Promise<AskActionResult> {
  try {
    const { user, active } = await assertCanAsk();
    await assertPlanAllows(active.organization_id, "ai_runs_month");

    const parsed = sendSchema.safeParse({
      question: formData.get("question"),
      brandId: formData.get("brandId"),
      conversationId: formData.get("conversationId") || undefined,
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    await assertAskRateLimit({
      organizationId: active.organization_id,
      userId: user.id,
    });

    const supabase = await createClient();
    const { data: brand } = await supabase
      .from("brands")
      .select("id")
      .eq("id", parsed.data.brandId)
      .eq("organization_id", active.organization_id)
      .single();
    if (!brand) return { error: "Brand not found" };

    let conversationId = parsed.data.conversationId;
    if (!conversationId) {
      const title =
        parsed.data.question.length > 60
          ? `${parsed.data.question.slice(0, 57)}…`
          : parsed.data.question;
      const { data: conv, error } = await supabase
        .from("team_ask_conversations")
        .insert({
          organization_id: active.organization_id,
          user_id: user.id,
          brand_id: parsed.data.brandId,
          title,
        })
        .select("id")
        .single();
      if (error || !conv) return { error: error?.message ?? "Failed to start chat" };
      conversationId = conv.id;
    } else {
      const { data: existing } = await supabase
        .from("team_ask_conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("organization_id", active.organization_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!existing) return { error: "Conversation not found" };
    }

    const { data: prior } = await supabase
      .from("team_ask_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(24);

    await supabase.from("team_ask_messages").insert({
      organization_id: active.organization_id,
      conversation_id: conversationId,
      role: "user",
      content: parsed.data.question,
    });

    const history = (prior ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content as string,
      }));

    const { result, agentRunId } = await runTeamAsk({
      organizationId: active.organization_id,
      brandId: parsed.data.brandId,
      userId: user.id,
      question: parsed.data.question,
      history,
    });

    await supabase.from("team_ask_messages").insert({
      organization_id: active.organization_id,
      conversation_id: conversationId,
      role: "assistant",
      content: result.answer_markdown,
      department: result.department,
      agent_run_id: agentRunId,
      tool_payload: { actions_summary: result.actions_summary },
    });

    await supabase
      .from("team_ask_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    revalidatePath("/ask");
    revalidatePath(`/ask?c=${conversationId}`);

    return {
      conversationId,
      answer: result.answer_markdown,
      department: result.department,
      actionsSummary: result.actions_summary,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Ask failed",
    };
  }
}

export async function createAskConversation(brandId: string) {
  const { user, active } = await assertCanAsk();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_ask_conversations")
    .insert({
      organization_id: active.organization_id,
      user_id: user.id,
      brand_id: brandId,
      title: "New conversation",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed");
  revalidatePath("/ask");
  return data.id as string;
}
