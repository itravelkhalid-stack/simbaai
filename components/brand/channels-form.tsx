"use client";

import { useActionState } from "react";

import {
  saveBrandEnabledChannels,
  type BrandActionResult,
} from "@/lib/brand/actions";
import {
  BRAND_CHANNEL_LABELS,
  BRAND_CHANNELS,
  type BrandChannel,
} from "@/lib/brand/channel-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initial: BrandActionResult = {};

export function BrandChannelsForm({
  brandId,
  brandName,
  selected,
  connected,
  canWrite,
}: {
  brandId: string;
  brandName: string;
  selected: BrandChannel[];
  connected: BrandChannel[];
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveBrandEnabledChannels,
    initial,
  );
  const selectedSet = new Set(selected);
  const connectedSet = new Set(connected);

  return (
    <form action={action} className="space-y-5 rounded-xl border p-5">
      <input type="hidden" name="brandId" value={brandId} />
      <div>
        <h2 className="text-lg font-medium">{brandName}</h2>
        <p className="text-sm text-muted-foreground">
          Content generation and plan materialization only use these channels.
          Leave empty to auto-derive from connected accounts
          {connected.length
            ? ` (currently: ${connected.map((c) => BRAND_CHANNEL_LABELS[c]).join(", ")})`
            : ""}
          .
        </p>
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? (
        <Alert>
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      ) : null}

      <ul className="grid gap-2 sm:grid-cols-2">
        {BRAND_CHANNELS.map((channel) => (
          <li key={channel}>
            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <input
                type="checkbox"
                name="channels"
                value={channel}
                defaultChecked={selectedSet.has(channel)}
                disabled={!canWrite}
                className="size-4"
              />
              <span>{BRAND_CHANNEL_LABELS[channel]}</span>
              {connectedSet.has(channel) ? (
                <span className="ml-auto text-xs text-muted-foreground">
                  Connected
                </span>
              ) : null}
            </label>
          </li>
        ))}
      </ul>

      {canWrite ? (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save channels"}
        </Button>
      ) : null}
    </form>
  );
}
