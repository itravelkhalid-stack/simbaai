"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";

import { getRecipes } from "@/lib/automations/recipes";
import { runAutomation } from "@/lib/automations/runner";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type {
  Automation,
  AutomationAction,
  AutomationStatus,
  AutomationTrigger,
  ConditionGroup,
} from "@/lib/types/automations";
import { writeAuditEvent } from "@/lib/compliance/audit";

export type AutomationsActionResult = {
  error?: string;
  success?: string;
  runId?: string;
};

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot modify automations");
  }
  return ctx;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function createAutomationFromRecipe(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const recipeId = String(formData.get("recipeId") ?? "");
  const brandId = String(formData.get("brandId") ?? "");
  const recipe = getRecipes().find((r) => r.id === recipeId);
  if (!recipe || !brandId) throw new Error("Recipe or brand missing");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automations")
    .insert({
      organization_id: active.organization_id,
      brand_id: brandId,
      name: recipe.name,
      description: recipe.description,
      status: "draft",
      trigger: recipe.trigger,
      conditions: recipe.conditions,
      actions: recipe.actions,
      webhook_secret: randomBytes(24).toString("hex"),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed");

  await writeAuditEvent({
    organizationId: active.organization_id,
    actorUserId: user.id,
    action: "settings_change",
    entityType: "automation",
    entityId: data.id,
    summary: `Created automation from recipe “${recipe.name}”`,
  });

  revalidatePath("/automations");
  redirect(`/automations/${data.id}`);
}

export async function createBlankAutomation(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const brandId = String(formData.get("brandId") ?? "");
  const name = String(formData.get("name") ?? "").trim() || "New automation";
  if (!brandId) throw new Error("Brand required");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automations")
    .insert({
      organization_id: active.organization_id,
      brand_id: brandId,
      name,
      description: "",
      status: "draft",
      trigger: { type: "event", event: "subscriber.created" },
      conditions: [],
      actions: [
        {
          type: "notify",
          channels: ["in_app"],
          title: "Automation fired",
          body: name,
        },
      ],
      webhook_secret: randomBytes(24).toString("hex"),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed");
  revalidatePath("/automations");
  redirect(`/automations/${data.id}`);
}

export async function saveAutomation(
  _prev: AutomationsActionResult,
  formData: FormData,
): Promise<AutomationsActionResult> {
  try {
    const { user, active } = await assertCanWrite();
    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const status = String(formData.get("status") ?? "draft") as AutomationStatus;
    const trigger = parseJson<AutomationTrigger>(
      String(formData.get("trigger_json") ?? "{}"),
      { type: "event", event: "subscriber.created" },
    );
    const conditions = parseJson<ConditionGroup[]>(
      String(formData.get("conditions_json") ?? "[]"),
      [],
    );
    const actions = parseJson<AutomationAction[]>(
      String(formData.get("actions_json") ?? "[]"),
      [],
    );
    if (!id || !name) return { error: "Name required" };
    if (!actions.length) return { error: "Add at least one action" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("automations")
      .update({
        name,
        description: description || null,
        status,
        trigger,
        conditions,
        actions,
      })
      .eq("id", id)
      .eq("organization_id", active.organization_id);
    if (error) return { error: error.message };

    await writeAuditEvent({
      organizationId: active.organization_id,
      actorUserId: user.id,
      action: "settings_change",
      entityType: "automation",
      entityId: id,
      summary: `Updated automation “${name}” (${status})`,
      after: { status, trigger_type: trigger.type },
    });

    revalidatePath("/automations");
    revalidatePath(`/automations/${id}`);
    return { success: "Saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function setAutomationStatus(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as AutomationStatus;
  const supabase = await createClient();
  await supabase
    .from("automations")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", active.organization_id);
  await writeAuditEvent({
    organizationId: active.organization_id,
    actorUserId: user.id,
    action: "settings_change",
    entityType: "automation",
    entityId: id,
    summary: `Automation status → ${status}`,
  });
  revalidatePath("/automations");
  revalidatePath(`/automations/${id}`);
}

export async function testRunAutomation(
  _prev: AutomationsActionResult,
  formData: FormData,
): Promise<AutomationsActionResult> {
  try {
    const { active } = await assertCanWrite();
    const id = String(formData.get("id") ?? "");
    const sampleRaw = String(formData.get("sample_json") ?? "{}");
    const sample = parseJson<Record<string, unknown>>(sampleRaw, {});
    const dryRun = formData.get("dryRun") === "on" || formData.get("dryRun") === "true";

    const supabase = await createClient();
    const { data } = await supabase
      .from("automations")
      .select("*")
      .eq("id", id)
      .eq("organization_id", active.organization_id)
      .single();
    if (!data) return { error: "Not found" };

    const run = await runAutomation({
      automation: data as Automation,
      triggerData: { ...sample, test_run: true },
      dryRun,
    });
    revalidatePath(`/automations/${id}`);
    return {
      success: dryRun ? "Dry-run completed" : "Test run completed",
      runId: run.id,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Test failed" };
  }
}

export async function saveAutomationSettings(
  _prev: AutomationsActionResult,
  formData: FormData,
): Promise<AutomationsActionResult> {
  try {
    const { user, active } = await assertCanWrite();
    if (active.role !== "org_owner" && active.role !== "org_admin") {
      return { error: "Only admins can change safety settings" };
    }
    const brandId = String(formData.get("brandId") ?? "");
    const channels = formData.getAll("auto_publish_channels").map(String);
    const cap = Math.round(
      Number(formData.get("daily_budget_cap") ?? 500) * 100,
    );
    const slack = String(formData.get("slack_webhook_url") ?? "").trim() || null;

    const supabase = await createClient();
    const { error } = await supabase.from("brand_automation_settings").upsert(
      {
        organization_id: active.organization_id,
        brand_id: brandId,
        auto_publish_channels: channels,
        daily_budget_action_cap_pence: Math.max(0, cap),
        slack_webhook_url: slack,
      },
      { onConflict: "brand_id" },
    );
    if (error) return { error: error.message };

    await writeAuditEvent({
      organizationId: active.organization_id,
      actorUserId: user.id,
      action: "settings_change",
      entityType: "brand_automation_settings",
      entityId: brandId,
      summary: "Updated automation safety settings",
      after: { auto_publish_channels: channels, daily_budget_cap_pence: cap },
    });

    revalidatePath("/automations/settings");
    return { success: "Settings saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function deleteAutomation(formData: FormData) {
  const { active } = await assertCanWrite();
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  await supabase
    .from("automations")
    .delete()
    .eq("id", id)
    .eq("organization_id", active.organization_id);
  revalidatePath("/automations");
  redirect("/automations");
}
