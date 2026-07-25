import {
  getMetaPublishCapabilities,
  metaInstagramUiStatus,
} from "@/lib/social/meta-capabilities";
import { isExpired, type SocialConnection } from "@/lib/social/types";
import { Badge } from "@/components/ui/badge";

const IG_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
];

function tokenCountdown(expiresAt: string | null): {
  label: string;
  critical: boolean;
} {
  if (!expiresAt) return { label: "no recorded expiry", critical: false };
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return { label: "expired", critical: true };
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) {
    return { label: `expires in ${days}d ${hours}h`, critical: days < 7 };
  }
  return { label: `expires in ${hours}h`, critical: true };
}

function meta(connection: SocialConnection | null | undefined) {
  const m = connection?.metadata ?? {};
  return {
    pageId: typeof m.page_id === "string" ? m.page_id : null,
    pageName: typeof m.page_name === "string" ? m.page_name : null,
    igUserId: typeof m.ig_user_id === "string" ? m.ig_user_id : null,
    igUsername: typeof m.ig_username === "string" ? m.ig_username : null,
  };
}

export function MetaHealthPanel({
  facebook,
  instagram,
  lastPublished,
}: {
  facebook: SocialConnection | null;
  instagram: SocialConnection | null;
  /** platform -> ISO timestamp of most recent successful publish */
  lastPublished: Record<string, string | null>;
}) {
  if (!facebook && !instagram) return null;

  const fbMeta = meta(facebook);
  const igMeta = meta(instagram ?? facebook);
  const caps = getMetaPublishCapabilities({ scopes: facebook?.scopes });
  const grantedScopes = new Set(facebook?.scopes ?? []);
  const countdown = tokenCountdown(facebook?.token_expires_at ?? null);
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

  const fbHealthy =
    facebook?.status === "active" && !isExpired(facebook.token_expires_at);

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div>
        <h2 className="font-medium">Meta connection health</h2>
        <p className="text-sm text-muted-foreground">
          What the publisher sees for this Meta connection.
        </p>
      </div>

      <dl className="grid gap-3 text-sm md:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-xs font-medium uppercase text-muted-foreground">
            Facebook Page
          </dt>
          <dd className="flex flex-wrap items-center gap-2">
            <Badge variant={fbHealthy ? "secondary" : "destructive"}>
              {fbHealthy ? "healthy" : facebook ? "needs reconnect" : "none"}
            </Badge>
            <span>
              {fbMeta.pageName ?? facebook?.account_name ?? "—"}
              {fbMeta.pageId ? ` · ${fbMeta.pageId}` : ""}
            </span>
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="text-xs font-medium uppercase text-muted-foreground">
            Instagram account
          </dt>
          <dd className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                igUi === "connected"
                  ? "secondary"
                  : igUi === "needs_reconnect"
                    ? "destructive"
                    : "outline"
              }
            >
              {igUi === "connected"
                ? "linked"
                : igUi === "needs_reconnect"
                  ? "needs reconnect"
                  : "not linked"}
            </Badge>
            <span>
              {igMeta.igUsername
                ? `@${igMeta.igUsername}`
                : (igMeta.igUserId ?? "No Business/Creator IG on this Page")}
            </span>
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="text-xs font-medium uppercase text-muted-foreground">
            Token
          </dt>
          <dd className="flex flex-wrap items-center gap-2">
            <Badge variant={countdown.critical ? "destructive" : "secondary"}>
              {countdown.label}
            </Badge>
            {facebook?.token_expires_at ? (
              <span className="text-muted-foreground">
                {new Date(facebook.token_expires_at).toLocaleString()}
              </span>
            ) : null}
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="text-xs font-medium uppercase text-muted-foreground">
            Instagram scopes
          </dt>
          <dd className="flex flex-wrap items-center gap-1">
            <Badge variant={caps.canPublishInstagram ? "secondary" : "destructive"}>
              {caps.canPublishInstagram ? "publish granted" : "publish missing"}
            </Badge>
            {IG_SCOPES.map((scope) => (
              <Badge
                key={scope}
                variant={grantedScopes.has(scope) ? "outline" : "destructive"}
              >
                {scope.replace("instagram_", "ig:")}{" "}
                {grantedScopes.has(scope) ? "✓" : "✗"}
              </Badge>
            ))}
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="text-xs font-medium uppercase text-muted-foreground">
            Last successful publish — Facebook
          </dt>
          <dd>
            {lastPublished.facebook
              ? new Date(lastPublished.facebook).toLocaleString()
              : "Never"}
          </dd>
        </div>

        <div className="space-y-1">
          <dt className="text-xs font-medium uppercase text-muted-foreground">
            Last successful publish — Instagram
          </dt>
          <dd>
            {lastPublished.instagram
              ? new Date(lastPublished.instagram).toLocaleString()
              : "Never"}
          </dd>
        </div>
      </dl>

      {!caps.canPublishInstagram ? (
        <p className="text-xs text-muted-foreground">
          To enable Instagram publishing: add Instagram permissions to the Meta
          app use case, set META_REQUEST_IG_SCOPES=true, redeploy, then
          disconnect and reconnect Meta.
        </p>
      ) : null}
    </div>
  );
}
