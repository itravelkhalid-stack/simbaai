"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { completeLinkedInOrgSelection } from "@/lib/social/linkedin-connect";
import { requireActiveOrg } from "@/lib/org/require";

export type LinkedInSelectResult = { error?: string };

export async function selectLinkedInOrg(
  _prev: LinkedInSelectResult,
  formData: FormData,
): Promise<LinkedInSelectResult> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const orgId = String(formData.get("orgId") ?? "");
  if (!sessionId || !orgId) return { error: "Select a company Page" };

  try {
    const { active } = await requireActiveOrg();
    if (active.role !== "org_owner" && active.role !== "org_admin") {
      return { error: "Only owners/admins can connect accounts" };
    }

    await completeLinkedInOrgSelection({
      sessionId,
      orgId,
      organizationId: active.organization_id,
    });

    revalidatePath("/social");
    revalidatePath("/settings/connections");
    redirect("/social?connected=linkedin");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return {
      error:
        error instanceof Error ? error.message : "Failed to save company Page",
    };
  }
}
