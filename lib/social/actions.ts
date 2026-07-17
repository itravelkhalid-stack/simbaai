"use server";

import { revalidatePath } from "next/cache";

import { inngest } from "@/lib/inngest/client";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";

export async function disconnectSocialConnection(formData: FormData) {
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!connectionId) throw new Error("Missing connection");

  const { active } = await requireActiveOrg();
  if (active.role !== "org_owner" && active.role !== "org_admin") {
    throw new Error("Only owners/admins can disconnect accounts");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("social_connections")
    .update({ status: "revoked" })
    .eq("id", connectionId)
    .eq("organization_id", active.organization_id);

  if (error) throw new Error(error.message);
  revalidatePath("/settings/connections");
  revalidatePath("/content/calendar");
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
