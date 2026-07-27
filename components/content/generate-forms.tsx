"use client";
import { fieldSelectClass } from "@/lib/ui/field";

import { useActionState, useState } from "react";

import {
  queueBatchPropose,
  queueSingleGenerate,
  type ContentActionResult,
} from "@/lib/content/actions";
import {
  FORMAT_LABELS,
  PLATFORM_LABELS,
  type ContentFormat,
  type ContentPillar,
  type ContentPlatform,
} from "@/lib/types/content";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: ContentActionResult = {};
const formats = Object.keys(FORMAT_LABELS) as ContentFormat[];

export function GenerateForms({
  pillars,
  enabledPlatforms,
}: {
  pillars: ContentPillar[];
  enabledPlatforms: ContentPlatform[];
}) {
  const platforms =
    enabledPlatforms.length > 0
      ? enabledPlatforms
      : (["facebook", "instagram"] as ContentPlatform[]);
  const [tab, setTab] = useState<"single" | "batch">("single");
  const [singleState, singleAction, singlePending] = useActionState(
    queueSingleGenerate,
    initial,
  );
  const [batchState, batchAction, batchPending] = useActionState(
    queueBatchPropose,
    initial,
  );

  const twoWeeksOut = new Date();
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 13);
  const today = new Date().toISOString().slice(0, 10);
  const end = twoWeeksOut.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={tab === "single" ? "default" : "outline"}
          onClick={() => setTab("single")}
        >
          Single / script
        </Button>
        <Button
          type="button"
          variant={tab === "batch" ? "default" : "outline"}
          onClick={() => setTab("batch")}
        >
          2-week batch
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Platforms limited to this brand&apos;s enabled channels:{" "}
        {platforms.map((p) => PLATFORM_LABELS[p]).join(", ")}.{" "}
        <a href="/brand/channels" className="underline">
          Manage channels
        </a>
      </p>

      {tab === "single" ? (
        <form action={singleAction} className="space-y-4 rounded-xl border p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="platform">Platform</Label>
              <select
                id="platform"
                name="platform"
                className={fieldSelectClass}
                defaultValue={platforms[0]}
              >
                {platforms.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="format">Format</Label>
              <select
                id="format"
                name="format"
                className={fieldSelectClass}
                defaultValue="post"
              >
                {formats.map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pillarId">Pillar</Label>
            <select
              id="pillarId"
              name="pillarId"
              className={fieldSelectClass}
              defaultValue=""
            >
              <option value="">None</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="topic">Topic / brief</Label>
            <Textarea id="topic" name="topic" required rows={4} />
          </div>
          {singleState.error ? (
            <Alert variant="destructive">
              <AlertDescription>{singleState.error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={singlePending}>
            {singlePending ? "Queuing…" : "Generate (injects brand context)"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Posts return 3 variants. Fitting library images are auto-attached as
            suggestions when tags match.
          </p>
        </form>
      ) : (
        <form action={batchAction} className="space-y-4 rounded-xl border p-4">
          <div className="space-y-2">
            <Label htmlFor="title">Plan title</Label>
            <Input id="title" name="title" required defaultValue="2-week content plan" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start</Label>
              <Input id="startDate" name="startDate" type="date" required defaultValue={today} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End</Label>
              <Input id="endDate" name="endDate" type="date" required defaultValue={end} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="brief">Brief</Label>
            <Textarea
              id="brief"
              name="brief"
              required
              rows={4}
              placeholder="Campaign themes, offers, launches, constraints…"
            />
          </div>
          {batchState.error ? (
            <Alert variant="destructive">
              <AlertDescription>{batchState.error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={batchPending}>
            {batchPending ? "Queuing…" : "Propose 2-week mix"}
          </Button>
        </form>
      )}
    </div>
  );
}
