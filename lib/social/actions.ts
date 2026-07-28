"use server";

import { revalidatePath } from "next/cache";

import { inngest } from "@/lib/inngest/client";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { ContentPlatform } from "@/lib/types/content";

async function assertCanManageConnections() {
  const { active } = await requireActiveOrg();
  if (active.role !== "org_owner" && active.role !== "org_admin") {
    throw new Error("Only owners/admins can manage connections");
  }
  return active;
}

export async function disconnectSocialConnection(formData: FormData) {
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) throw new Error("Missing connection");

  const active = await assertCanManageConnections();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("social_connections")
    .select("id, platform, brand_id")
    .eq("id", connectionId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();

  if (!existing) throw new Error("Connection not found");

  const { error } = await supabase
    .from("social_connections")
    .update({ status: "revoked" })
    .eq("id", connectionId)
    .eq("organization_id", active.organization_id);

  if (error) throw new Error(error.message);

  // Meta disconnect removes both Facebook and Instagram for the brand
  if (existing.platform === "facebook") {
    await supabase
      .from("social_connections")
      .update({ status: "revoked" })
      .eq("organization_id", active.organization_id)
      .eq("brand_id", existing.brand_id)
      .eq("platform", "instagram")
      .neq("status", "revoked");
  }

  revalidatePath("/settings/connections");
  revalidatePath("/social");
  revalidatePath("/content/calendar");
}

/**
 * Soft-pause / resume. Tokens stay encrypted on the row — no OAuth needed to resume.
 * Pausing Meta (facebook) also pauses the brand's Instagram connection.
 */
export async function setSocialConnectionPaused(formData: FormData) {
  const connectionId = String(formData.get("connectionId") ?? "");
  const pausedRaw = String(formData.get("paused") ?? "");
  const paused = pausedRaw === "true" || pausedRaw === "1" || pausedRaw === "on";
  if (!connectionId) throw new Error("Missing connection");

  const active = await assertCanManageConnections();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("social_connections")
    .select("id, platform, brand_id, status")
    .eq("id", connectionId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();

  if (!existing) throw new Error("Connection not found");
  if (existing.status === "revoked") {
    throw new Error("Reconnect this account before pausing or resuming");
  }

  const { error } = await supabase
    .from("social_connections")
    .update({ paused })
    .eq("id", connectionId)
    .eq("organization_id", active.organization_id);

  if (error) throw new Error(error.message);

  if (existing.platform === "facebook") {
    await supabase
      .from("social_connections")
      .update({ paused })
      .eq("organization_id", active.organization_id)
      .eq("brand_id", existing.brand_id)
      .eq("platform", "instagram")
      .neq("status", "revoked");
  }

  revalidatePath("/settings/connections");
  revalidatePath("/social");
  revalidatePath("/content");
  revalidatePath("/content/generate");
  revalidatePath("/content/calendar");
}

/**
 * Clear scheduled posts for platforms that have no active connection.
 * Moves them back to draft so the orphan warning can clear.
 */
export async function unscheduleOrphanedScheduledPosts(formData: FormData) {
  const active = await assertCanManageConnections();
  const raw = String(formData.get("platforms") ?? "");
  const platforms = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean) as ContentPlatform[];

  if (platforms.length === 0) {
    throw new Error("No platforms to unschedule");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("content_items")
    .update({
      status: "draft",
      scheduled_at: null,
      publish_error: null,
    })
    .eq("organization_id", active.organization_id)
    .eq("status", "scheduled")
    .in("platform", platforms);

  if (error) throw new Error(error.message);

  revalidatePath("/settings/connections");
  revalidatePath("/social");
  revalidatePath("/content/calendar");
  revalidatePath("/content");
}

export async function retryPublishContentItem(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) throw new Error("Missing item");

  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("content_items")
    .select("id")
    .eq("id", itemId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();

  if (!item) throw new Error("Item not found");

  await supabase
    .from("content_items")
    .update({
      status: "scheduled",
      publish_error: null,
      publish_attempts: 0,
    })
    .eq("id", itemId);

  await inngest.send({
    name: "social/publish.requested",
    data: { contentItemId: itemId },
  });

  revalidatePath("/content/calendar");
  revalidatePath(`/content/${itemId}`);
}
