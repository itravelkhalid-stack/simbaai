"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { completeMetaPageSelection } from "@/lib/social/meta-connect";
import { requireActiveOrg } from "@/lib/org/require";

export type MetaSelectResult = { error?: string };

export async function selectMetaPage(
  _prev: MetaSelectResult,
  formData: FormData,
): Promise<MetaSelectResult> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const pageId = String(formData.get("pageId") ?? "");
  if (!sessionId || !pageId) return { error: "Select a Page" };

  try {
    const { active } = await requireActiveOrg();
    if (active.role !== "org_owner" && active.role !== "org_admin") {
      return { error: "Only owners/admins can connect accounts" };
    }

    const connection = await completeMetaPageSelection({
      sessionId,
      pageId,
      organizationId: active.organization_id,
    });

    revalidatePath("/social");
    revalidatePath("/settings/connections");
    redirect(`/social?connected=${connection.platform}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return {
      error: error instanceof Error ? error.message : "Failed to save Page",
    };
  }
}
