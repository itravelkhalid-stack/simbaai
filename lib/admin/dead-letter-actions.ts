"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { inngest } from "@/lib/inngest/client";
import { markDeadLetter } from "@/lib/jobs/dead-letter";
import { requireUser } from "@/lib/org/require";
import { isPlatformAdminUser } from "@/lib/org/session";
import { parseFormData, uuidSchema } from "@/lib/security/validate";
import { createAdminClient } from "@/lib/supabase/admin";

async function assertAdmin() {
  const { user } = await requireUser();
  if (!(await isPlatformAdminUser(user.id))) {
    throw new Error("Platform admin only");
  }
  return user;
}

const idSchema = z.object({ id: uuidSchema });

export async function retryDeadLetter(formData: FormData) {
  const user = await assertAdmin();
  const { id } = parseFormData(idSchema, formData);
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("job_dead_letters")
    .select("*")
    .eq("id", id)
    .single();
  if (!row) throw new Error("Dead letter not found");

  await markDeadLetter(id, "retrying", user.id);

  const payload = (row.payload ?? {}) as Record<string, unknown>;
  if (row.event_name) {
    await inngest.send({
      name: row.event_name,
      data: payload,
    });
  } else if (row.agent_run_id) {
    await inngest.send({
      name: "jobs/retry-agent-run",
      data: { agentRunId: row.agent_run_id, deadLetterId: id },
    });
  }

  revalidatePath("/admin/jobs");
}

export async function discardDeadLetter(formData: FormData) {
  const user = await assertAdmin();
  const { id } = parseFormData(idSchema, formData);
  await markDeadLetter(id, "discarded", user.id);
  revalidatePath("/admin/jobs");
}

export async function resolveDeadLetter(formData: FormData) {
  const user = await assertAdmin();
  const { id } = parseFormData(idSchema, formData);
  await markDeadLetter(id, "resolved", user.id);
  revalidatePath("/admin/jobs");
}
