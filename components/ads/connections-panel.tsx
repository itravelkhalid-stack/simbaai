"use client";

import { useActionState } from "react";

import {
  connectAdAccountManual,
  disconnectAdAccount,
  setAdConnectionPaused,
  type AdsActionResult,
} from "@/lib/ads/actions";
import { AD_PLATFORMS } from "@/lib/ads/providers";
import type { AdConnection, AdPlatform } from "@/lib/types/ads";
import { AD_PLATFORM_LABELS } from "@/lib/types/ads";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fieldSelectClass } from "@/lib/ui/field";

const initial: AdsActionResult = {};

function connectionHealth(c: AdConnection): {
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
  detail: string;
} {
  const expires = c.token_expires_at
    ? new Date(c.token_expires_at).getTime() - Date.now()
    : null;
  if (c.paused && c.status === "active") {
    return {
      label: "Paused — not publishing",
      tone: "warning",
      detail: "Tokens kept — resume anytime without reconnecting",
    };
  }
  if (c.status === "error" || c.status === "revoked") {
    return {
      label: "Needs reconnect",
      tone: "danger",
      detail: c.last_error ?? c.status,
    };
  }
  if (c.status === "expired" || (expires != null && expires <= 0)) {
    return {
      label: "Expired",
      tone: "danger",
      detail: "Token expired — reconnect to resume sync",
    };
  }
  if (c.status === "pending") {
    return {
      label: "Pending",
      tone: "warning",
      detail: "Connection not fully verified",
    };
  }
  if (expires != null && expires < 7 * 86_400_000) {
    const days = Math.max(1, Math.floor(expires / 86_400_000));
    return {
      label: "Expiring soon",
      tone: "warning",
      detail: `Token expires in ${days}d`,
    };
  }
  if (c.status === "active") {
    return {
      label: "Healthy",
      tone: "success",
      detail: expires
        ? `Expires ${new Date(c.token_expires_at!).toLocaleDateString()}`
        : "Active",
    };
  }
  return { label: c.status, tone: "neutral", detail: "" };
}

export function ConnectionsPanel({
  connections,
  oauthEnabled,
}: {
  connections: AdConnection[];
  /** Platforms with OAuth credentials configured (evaluated on the server). */
  oauthEnabled: AdPlatform[];
}) {
  const [state, action, pending] = useActionState(connectAdAccountManual, initial);
  const oauthSet = new Set(oauthEnabled);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {AD_PLATFORMS.map((platform) => {
          const canOAuth = oauthSet.has(platform);
          const connected = connections.filter((c) => c.platform === platform);
          const best = connected[0];
          const health = best ? connectionHealth(best) : null;

          return (
            <div
              key={platform}
              className="rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-heading font-semibold text-ink">
                    {AD_PLATFORM_LABELS[platform]}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {connected.length
                      ? `${connected.length} account${connected.length === 1 ? "" : "s"}`
                      : "Not connected"}
                  </p>
                </div>
                {health ? (
                  <Badge variant={health.tone}>{health.label}</Badge>
                ) : (
                  <Badge variant="neutral">Offline</Badge>
                )}
              </div>
              {health ? (
                <p className="mt-2 text-xs text-ink-soft">{health.detail}</p>
              ) : (
                <p className="mt-2 text-xs text-ink-soft">
                  Campaign writes require ADS_WRITES_ENABLED.
                </p>
              )}
              {canOAuth ? (
                <a
                  href={`/api/ads/oauth/${platform}/start`}
                  className={cn(buttonVariants({ size: "sm" }), "mt-4")}
                >
                  {connected.length ? "Reconnect OAuth" : "Connect OAuth"}
                </a>
              ) : (
                <p className="mt-3 text-xs text-ink-soft">
                  OAuth not configured — use token form below.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <form
        action={action}
        className="space-y-3 rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border"
      >
        <p className="font-heading text-sm font-semibold text-ink">
          Connect with access token
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="platform">Platform</Label>
            <select
              id="platform"
              name="platform"
              className={fieldSelectClass}
              defaultValue="meta"
            >
              {AD_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {AD_PLATFORM_LABELS[p as AdPlatform]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="accountId">Account ID</Label>
            <Input id="accountId" name="accountId" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accountName">Account name</Label>
            <Input id="accountName" name="accountName" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accessToken">Access token</Label>
            <Input id="accessToken" name="accessToken" type="password" required />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="refreshToken">Refresh token (optional)</Label>
            <Input id="refreshToken" name="refreshToken" type="password" />
          </div>
        </div>
        {state.error || state.success ? (
          <Alert variant={state.error ? "destructive" : "default"}>
            <AlertDescription>{state.error || state.success}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save connection"}
        </Button>
      </form>

      {connections.length > 0 ? (
        <ul className="space-y-3">
          {connections.map((c) => {
            const health = connectionHealth(c);
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-card p-4 shadow-elevated ring-1 ring-border"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">
                      {AD_PLATFORM_LABELS[c.platform]} · {c.account_name}
                    </p>
                    <Badge variant={health.tone}>{health.label}</Badge>
                  </div>
                  <p className="text-sm text-ink-soft">
                    {c.account_id}
                    {health.detail ? ` · ${health.detail}` : ""}
                  </p>
                  {c.last_error ? (
                    <p className="text-xs text-danger">{c.last_error}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {c.status === "active" || c.status === "expired" || c.status === "error" ? (
                    <form action={setAdConnectionPaused}>
                      <input type="hidden" name="connectionId" value={c.id} />
                      <input
                        type="hidden"
                        name="paused"
                        value={c.paused ? "false" : "true"}
                      />
                      <Button type="submit" size="sm" variant="outline">
                        {c.paused ? "Resume" : "Pause"}
                      </Button>
                    </form>
                  ) : null}
                  <form action={disconnectAdAccount}>
                    <input type="hidden" name="connectionId" value={c.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Disconnect
                    </Button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
