import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MetaPagePicker } from "@/components/social/meta-page-picker";
import { getMetaOAuthSession } from "@/lib/social/meta-connect";
import { requireActiveOrg } from "@/lib/org/require";
import type { MetaPageOption } from "@/lib/social/meta-scopes";

export default async function MetaPageSelectPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const params = await searchParams;
  const { active } = await requireActiveOrg();

  if (!params.session) {
    redirect("/social?error=missing_meta_session");
  }

  const session = await getMetaOAuthSession(params.session);
  if (!session || session.organization_id !== active.organization_id) {
    notFound();
  }

  if (active.role !== "org_owner" && active.role !== "org_admin") {
    redirect("/social?error=forbidden");
  }

  const pages = (session.pages ?? []) as MetaPageOption[];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/social" className="text-sm text-muted-foreground underline">
          ← Social
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Choose a Facebook Page
        </h1>
        <p className="mt-2 text-muted-foreground">
          Pick which Page Simba AI should publish to. If the Page has a linked
          Instagram Business account and Instagram scopes were granted, Instagram
          publishing is enabled automatically.
        </p>
      </div>

      <MetaPagePicker sessionId={session.id} pages={pages} />
    </div>
  );
}
