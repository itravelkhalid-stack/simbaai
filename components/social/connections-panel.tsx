"use client";

import Link from "next/link";

import { disconnectSocialConnection } from "@/lib/social/actions";
import {
  expiresWithinDays,
  isExpired,
  type SocialConnection,
} from "@/lib/social/types";
import { CONNECTABLE_PLATFORMS } from "@/lib/social/providers";
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

  return (
    <div className="space-y-6">
      {flash?.connected ? (
        <Alert>
          <AlertDescription>
            Connected{" "}
            {PLATFORM_LABELS[flash.connected as ContentPlatform] ??
              flash.connected}
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
        {CONNECTABLE_PLATFORMS.map((platform) => {
          const connection = byPlatform.get(platform);
          const expiring =
            connection &&
            expiresWithinDays(connection.token_expires_at, 7) &&
            !isExpired(connection.token_expires_at);
          const expired =
            connection &&
            (connection.status === "expired" ||
              isExpired(connection.token_expires_at));
          const meta =
            connection &&
            (platform === "facebook" || platform === "instagram")
              ? metaMeta(connection)
              : null;

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
                  <div className="space-y-0.5 text-sm text-muted-foreground">
                    <p>
                      {connection.account_name} · {connection.account_id}
                      {connection.token_expires_at
                        ? ` · token ends ${new Date(connection.token_expires_at).toLocaleString()}`
                        : ""}
                    </p>
                    {meta?.pageId ? (
                      <p>
                        Page {meta.pageName || meta.pageId}
                        {meta.igUserId
                          ? ` · IG ${meta.igUsername || meta.igUserId}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Connect via OAuth to enable publishing and metrics.
                    {platform === "facebook" || platform === "instagram"
                      ? " You will pick a Page after login."
                      : ""}
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
                    {connection
                      ? platform === "facebook" || platform === "instagram"
                        ? "Reconnect / change Page"
                        : "Reconnect"
                      : "Connect"}
                  </Link>
                ) : null}
                {canManage && connection && connection.status !== "revoked" ? (
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
        })}
      </div>
    </div>
  );
}
