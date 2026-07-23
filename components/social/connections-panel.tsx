"use client";

import Link from "next/link";

import { disconnectSocialConnection } from "@/lib/social/actions";
import {
  metaInstagramUiStatus,
  type MetaInstagramUiStatus,
} from "@/lib/social/meta-capabilities";
import {
  expiresWithinDays,
  isExpired,
  type SocialConnection,
} from "@/lib/social/types";
import { CONNECTION_PANEL_PLATFORMS } from "@/lib/social/providers";
import {
  PLATFORM_LABELS,
  type ContentPlatform,
} from "@/lib/types/content";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function metaMeta(connection: SocialConnection) {
  const m = connection.metadata ?? {};
  return {
    pageId: typeof m.page_id === "string" ? m.page_id : null,
    pageName: typeof m.page_name === "string" ? m.page_name : null,
    igUserId: typeof m.ig_user_id === "string" ? m.ig_user_id : null,
    igUsername: typeof m.ig_username === "string" ? m.ig_username : null,
  };
}

function igStatusLabel(status: MetaInstagramUiStatus) {
  if (status === "connected") return "connected";
  if (status === "needs_reconnect") return "needs reconnect";
  return "not connected";
}

export function ConnectionsPanel({
  connections,
  missingPlatforms,
  canManage,
  flash,
}: {
  connections: SocialConnection[];
  missingPlatforms: ContentPlatform[];
  canManage: boolean;
  flash?: { connected?: string; error?: string };
}) {
  const byPlatform = new Map(connections.map((c) => [c.platform, c]));
  const facebook = byPlatform.get("facebook");
  const instagram = byPlatform.get("instagram");
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
  const fbMeta = facebook ? metaMeta(facebook) : null;
  const fbExpired =
    facebook &&
    (facebook.status === "expired" || isExpired(facebook.token_expires_at));
  const fbExpiring =
    facebook &&
    expiresWithinDays(facebook.token_expires_at, 7) &&
    !isExpired(facebook.token_expires_at);

  return (
    <div className="space-y-6">
      {flash?.connected ? (
        <Alert>
          <AlertDescription>
            Connected{" "}
            {flash.connected === "facebook" || flash.connected === "instagram"
              ? "Meta"
              : (PLATFORM_LABELS[flash.connected as ContentPlatform] ??
                flash.connected)}
            .
          </AlertDescription>
        </Alert>
      ) : null}
      {flash?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{flash.error}</AlertDescription>
        </Alert>
      ) : null}

      {missingPlatforms.length > 0 ? (
        <Alert variant="destructive">
          <AlertDescription>
            Scheduled content exists for platforms with no active connection:{" "}
            {missingPlatforms.map((p) => PLATFORM_LABELS[p]).join(", ")}. Connect
            them below or unschedule those posts.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4">
        {/* Unified Meta card */}
        <div className="rounded-xl border p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Meta</p>
              <p className="text-sm text-muted-foreground">
                Facebook Page + Instagram Business via one OAuth connect.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage ? (
                <Link
                  href="/api/social/oauth/facebook/start"
                  className={cn(
                    buttonVariants({
                      variant: facebook ? "outline" : "default",
                    }),
                  )}
                >
                  {facebook ? "Reconnect / change Page" : "Connect Meta"}
                </Link>
              ) : null}
              {canManage && facebook && facebook.status !== "revoked" ? (
                <form action={disconnectSocialConnection}>
                  <input
                    type="hidden"
                    name="connectionId"
                    value={facebook.id}
                  />
                  <Button type="submit" variant="destructive">
                    Disconnect
                  </Button>
                </form>
              ) : null}
            </div>
          </div>

          <div className="space-y-2 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Facebook Page:</span>
              {facebook && facebook.status === "active" && !fbExpired ? (
                <>
                  <Badge variant="secondary">connected</Badge>
                  <span className="text-muted-foreground">
                    {fbMeta?.pageName || facebook.account_name}
                    {fbMeta?.pageId ? ` · ${fbMeta.pageId}` : ""}
                  </span>
                </>
              ) : facebook && fbExpired ? (
                <Badge variant="destructive">needs reconnect</Badge>
              ) : (
                <Badge variant="outline">not connected</Badge>
              )}
              {fbExpiring ? (
                <Badge variant="destructive">expires within 7 days</Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Instagram:</span>
              <Badge
                variant={
                  igUi === "connected"
                    ? "secondary"
                    : igUi === "needs_reconnect"
                      ? "destructive"
                      : "outline"
                }
              >
                {igStatusLabel(igUi)}
              </Badge>
              {igUi === "connected" ? (
                <span className="text-muted-foreground">
                  {fbMeta?.igUsername
                    ? `@${fbMeta.igUsername}`
                    : fbMeta?.igUserId ||
                      instagram?.account_name ||
                      "Business account"}
                </span>
              ) : null}
              {igUi === "needs_reconnect" ? (
                <span className="text-xs text-muted-foreground">
                  Reconnect Meta with Instagram scopes enabled to publish.
                </span>
              ) : null}
              {igUi === "not_connected" && facebook ? (
                <span className="text-xs text-muted-foreground">
                  No IG account on this Page, or Instagram scopes not granted.
                </span>
              ) : null}
            </div>
            {facebook?.last_error ? (
              <p className="text-xs text-destructive">{facebook.last_error}</p>
            ) : null}
          </div>
        </div>

        {CONNECTION_PANEL_PLATFORMS.filter((p) => p !== "facebook").map(
          (platform) => {
            const connection = byPlatform.get(platform);
            const expiring =
              connection &&
              expiresWithinDays(connection.token_expires_at, 7) &&
              !isExpired(connection.token_expires_at);
            const expired =
              connection &&
              (connection.status === "expired" ||
                isExpired(connection.token_expires_at));

            return (
              <div
                key={platform}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{PLATFORM_LABELS[platform]}</p>
                    {connection ? (
                      <Badge
                        variant={
                          connection.status === "active" && !expired
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {expired ? "expired" : connection.status}
                      </Badge>
                    ) : (
                      <Badge variant="outline">not connected</Badge>
                    )}
                    {expiring ? (
                      <Badge variant="destructive">
                        reconnect needed (expires within 7 days)
                      </Badge>
                    ) : null}
                    {expired ? (
                      <Badge variant="destructive">reconnect needed</Badge>
                    ) : null}
                  </div>
                  {connection ? (
                    <p className="text-sm text-muted-foreground">
                      {connection.account_name} · {connection.account_id}
                      {connection.token_expires_at
                        ? ` · token ends ${new Date(connection.token_expires_at).toLocaleString()}`
                        : ""}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Connect via OAuth to enable publishing and metrics.
                    </p>
                  )}
                  {connection?.last_error ? (
                    <p className="text-xs text-destructive">
                      {connection.last_error}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {canManage ? (
                    <Link
                      href={`/api/social/oauth/${platform}/start`}
                      className={cn(
                        buttonVariants({
                          variant: connection ? "outline" : "default",
                        }),
                      )}
                    >
                      {connection ? "Reconnect" : "Connect"}
                    </Link>
                  ) : null}
                  {canManage &&
                  connection &&
                  connection.status !== "revoked" ? (
                    <form action={disconnectSocialConnection}>
                      <input
                        type="hidden"
                        name="connectionId"
                        value={connection.id}
                      />
                      <Button type="submit" variant="destructive">
                        Disconnect
                      </Button>
                    </form>
                  ) : null}
                </div>
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}
