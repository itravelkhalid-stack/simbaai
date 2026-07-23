import Link from "next/link";

import { ConnectionsPanel } from "@/components/social/connections-panel";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { SocialConnection } from "@/lib/social/types";
import type { ContentPlatform } from "@/lib/types/content";
import { PLATFORM_LABELS } from "@/lib/types/content";
import {
  CONNECTION_PANEL_PLATFORMS,
  CONNECTABLE_PLATFORMS,
} from "@/lib/social/providers";
import {
  connectionCanPublishInstagram,
  metaInstagramUiStatus,
} from "@/lib/social/meta-capabilities";
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
  const facebook = typed.find((c) => c.platform === "facebook");
  const instagram = typed.find((c) => c.platform === "instagram");

  const canPublishIg = Boolean(
    (instagram &&
      connectionCanPublishInstagram({
        scopes: instagram.scopes,
        metadata: instagram.metadata,
        platform: "instagram",
      })) ||
      (facebook &&
        connectionCanPublishInstagram({
          scopes: facebook.scopes,
          metadata: facebook.metadata,
          platform: "facebook",
        })),
  );

  const connectedPlatforms = new Set(
    typed.filter((c) => c.status === "active").map((c) => c.platform),
  );
  if (canPublishIg) connectedPlatforms.add("instagram");

  const { data: scheduled } = await supabase
    .from("content_items")
    .select("platform")
    .eq("organization_id", active.organization_id)
    .eq("status", "scheduled");

  const missingPlatforms = Array.from(
    new Set(
      (scheduled ?? [])
        .map((row) => row.platform as ContentPlatform)
        .filter((platform) => {
          if (platform === "instagram") return !canPublishIg;
          return !connectedPlatforms.has(platform);
        }),
    ),
  );

  const canManage = active.role === "org_owner" || active.role === "org_admin";
  const otherConnected = typed.filter(
    (c) =>
      c.status === "active" &&
      c.platform !== "facebook" &&
      c.platform !== "instagram",
  ).length;
  const metaConnected = facebook?.status === "active" ? 1 : 0;
  const panelTotal = CONNECTION_PANEL_PLATFORMS.length;
  const activeCount = otherConnected + metaConnected;

  const igUi = metaInstagramUiStatus({
    facebook: facebook
      ? {
          status: facebook.status,
          scopes: facebook.scopes,
          metadata: facebook.metadata,
          token_expires_at: facebook.token_expires_at,
        }
      : null,
    instagram: instagram
      ? {
          status: instagram.status,
          scopes: instagram.scopes,
          token_expires_at: instagram.token_expires_at,
        }
      : null,
  });

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
        <Badge
          variant={facebook?.status === "active" ? "default" : "outline"}
        >
          Meta · FB: {facebook?.status === "active" ? "connected" : "off"} · IG:{" "}
          {igUi === "connected"
            ? "connected"
            : igUi === "needs_reconnect"
              ? "needs reconnect"
              : "off"}
        </Badge>
        {CONNECTABLE_PLATFORMS.filter((p) => p !== "facebook").map(
          (platform) => {
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
          },
        )}
        <Badge variant="secondary">
          {activeCount}/{panelTotal} connected
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
