"use server";

import { revalidatePath } from "next/cache";

import { getAgentById } from "@/lib/agents/registry";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";

export type CeoHireActionResult = { error?: string; success?: string };

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot manage hiring");
  }
  return ctx;
}

export async function decideCeoHire(formData: FormData): Promise<void> {
  const { active } = await assertCanWrite();
  const activationId = String(formData.get("activationId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!activationId || !["activate", "decline"].includes(decision)) {
    throw new Error("Invalid hire decision");
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("brand_agent_activations")
    .select("*")
    .eq("id", activationId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!row) throw new Error("Hire proposal not found");
  if (!getAgentById(row.agent_id)) {
    throw new Error("Unknown registry agent — cannot hire");
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("brand_agent_activations")
    .update({
      status: decision === "activate" ? "active" : "declined",
      activated_at: decision === "activate" ? now : null,
      declined_at: decision === "decline" ? now : null,
      updated_at: now,
    })
    .eq("id", activationId)
    .eq("organization_id", active.organization_id);
  if (error) throw new Error(error.message);

  revalidatePath("/team");
  revalidatePath("/meetings");
}
