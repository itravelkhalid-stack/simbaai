import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LinkedInOrgPicker } from "@/components/social/linkedin-org-picker";
import { getLinkedInOAuthSession } from "@/lib/social/linkedin-connect";
import { requireActiveOrg } from "@/lib/org/require";
import type { LinkedInOrgOption } from "@/lib/social/linkedin-types";

export default async function LinkedInOrgSelectPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const params = await searchParams;
  const { active } = await requireActiveOrg();

  if (!params.session) {
    redirect("/social?error=missing_linkedin_session");
  }

  const session = await getLinkedInOAuthSession(params.session);
  if (!session || session.organization_id !== active.organization_id) {
    notFound();
  }

  if (active.role !== "org_owner" && active.role !== "org_admin") {
    redirect("/social?error=forbidden");
  }

  const orgs = (session.pages ?? []) as LinkedInOrgOption[];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/social" className="text-sm text-muted-foreground underline">
          ← Social
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Choose a LinkedIn company Page
        </h1>
        <p className="mt-2 text-muted-foreground">
          Pick which company Page Simba AI should publish to. You can change this
          later via Reconnect.
        </p>
      </div>

      <LinkedInOrgPicker sessionId={session.id} orgs={orgs} />
    </div>
  );
}
