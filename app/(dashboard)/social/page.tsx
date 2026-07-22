import Link from "next/link";

import { ConnectionsPanel } from "@/components/social/connections-panel";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { SocialConnection } from "@/lib/social/types";
import type { ContentPlatform } from "@/lib/types/content";
import { PLATFORM_LABELS } from "@/lib/types/content";
import { CONNECTABLE_PLATFORMS } from "@/lib/social/providers";
import { Badge } from "@/components/ui/badge";

export default async function SocialPage({
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
  const activeCount = typed.filter((c) => c.status === "active").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Social</h1>
        <p className="mt-2 text-muted-foreground">
          Connect publishing accounts and review per-platform status.{" "}
          <Link href="/settings/connections" className="underline">
            Also in Settings
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CONNECTABLE_PLATFORMS.map((platform) => {
          const connection = typed.find((c) => c.platform === platform);
          const status = connection?.status ?? "disconnected";
          return (
            <Badge
              key={platform}
              variant={status === "active" ? "default" : "outline"}
            >
              {PLATFORM_LABELS[platform]}: {status}
            </Badge>
          );
        })}
        <Badge variant="secondary">
          {activeCount}/{CONNECTABLE_PLATFORMS.length} connected
        </Badge>
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
