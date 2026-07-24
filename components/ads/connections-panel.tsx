"use client";

import { useActionState } from "react";

import {
  connectAdAccountManual,
  disconnectAdAccount,
  startAdOAuth,
  type AdsActionResult,
} from "@/lib/ads/actions";
import { AD_PLATFORMS } from "@/lib/ads/providers";
import type { AdConnection, AdPlatform } from "@/lib/types/ads";
import { AD_PLATFORM_LABELS } from "@/lib/types/ads";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AdsActionResult = {};

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
          return (
            <div key={platform} className="rounded-xl border p-4">
              <p className="font-medium">{AD_PLATFORM_LABELS[platform]}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Campaign writes require ADS_WRITES_ENABLED (see docs/ads-apis.md).
              </p>
              {canOAuth ? (
                <form action={startAdOAuth} className="mt-3">
                  <input type="hidden" name="platform" value={platform} />
                  <Button type="submit" size="sm">
                    Connect OAuth
                  </Button>
                </form>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  OAuth not configured — use token form below.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <form action={action} className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-medium">Connect with access token</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="platform">Platform</Label>
            <select
              id="platform"
              name="platform"
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
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

      <ul className="divide-y rounded-xl border">
        {connections.length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">No ad accounts connected.</li>
        ) : (
          connections.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">
                  {AD_PLATFORM_LABELS[c.platform]} · {c.account_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {c.account_id} · {c.status}
                </p>
              </div>
              <form action={disconnectAdAccount}>
                <input type="hidden" name="connectionId" value={c.id} />
                <Button type="submit" variant="outline" size="sm">
                  Disconnect
                </Button>
              </form>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
