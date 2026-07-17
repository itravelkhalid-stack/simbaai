import Link from "next/link";

import { ConnectionsPanel } from "@/components/social/connections-panel";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { SocialConnection } from "@/lib/social/types";
import type { ContentPlatform } from "@/lib/types/content";

export default async function ConnectionsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data: connections, error } = await supabase
    .from("social_connections")
    .select("*")
    .eq("organization_id", active.organization_id)
    .neq("status", "revoked")
    .order("platform");

  if (error) throw new Error(error.message);

  const typed = (connections ?? []) as SocialConnection[];
  const connectedPlatforms = new Set(
    typed.filter((c) => c.status === "active").map((c) => c.platform),
  );

  const { data: scheduled } = await supabase
    .from("content_items")
    .select("platform")
    .eq("organization_id", active.organization_id)
    .eq("status", "scheduled");

  const missingPlatforms = Array.from(
    new Set(
      (scheduled ?? [])
        .map((row) => row.platform as ContentPlatform)
        .filter((platform) => !connectedPlatforms.has(platform)),
    ),
  );

  const canManage = active.role === "org_owner" || active.role === "org_admin";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-muted-foreground underline">
          ← Settings
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Connections</h1>
        <p className="mt-2 text-muted-foreground">
          Connect social accounts for publishing. Tokens are encrypted at rest with
          AES-256-GCM. See <code>docs/integrations.md</code> for developer app setup.
        </p>
      </div>

      <ConnectionsPanel
        connections={typed}
        missingPlatforms={missingPlatforms}
        canManage={canManage}
        flash={{ connected: params.connected, error: params.error }}
      />
    </div>
  );
}
