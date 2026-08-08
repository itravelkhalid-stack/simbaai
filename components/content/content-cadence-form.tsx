"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveContentCadence } from "@/lib/content/actions";
import {
  DEFAULT_CONTENT_CADENCE,
  type ContentCadenceConfig,
} from "@/lib/content/cadence";

export function ContentCadenceForm({
  brandId,
  brandName,
  initial,
}: {
  brandId: string;
  brandName: string;
  initial: ContentCadenceConfig;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const ig = {
    ...DEFAULT_CONTENT_CADENCE.instagram,
    ...initial.instagram,
  };
  const fb = {
    ...DEFAULT_CONTENT_CADENCE.facebook,
    ...initial.facebook,
  };
  const li = {
    ...DEFAULT_CONTENT_CADENCE.linkedin,
    ...initial.linkedin,
  };

  return (
    <form
      className="space-y-4 rounded-xl border p-4"
      action={(formData) => {
        startTransition(async () => {
          const result = await saveContentCadence(formData);
          setMessage(result.error ?? result.success ?? null);
        });
      }}
    >
      <div>
        <h2 className="text-sm font-medium">Organic cadence — {brandName}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Daily targets the cadence filler keeps covered 7 days ahead. Stories
          use 9:16 media — IG via{" "}
          <code className="text-[10px]">media_type=STORIES</code>, Facebook via{" "}
          <code className="text-[10px]">/{`{page-id}`}/photo_stories</code>.
        </p>
      </div>
      <input type="hidden" name="brandId" value={brandId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-xs">Instagram feed / day</Label>
          <Input
            name="igFeed"
            type="number"
            min={0}
            max={10}
            defaultValue={ig.feed_per_day ?? 2}
          />
          <Label className="text-xs">Instagram stories / day</Label>
          <Input
            name="igStories"
            type="number"
            min={0}
            max={10}
            defaultValue={ig.stories_per_day ?? 2}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Facebook posts / day</Label>
          <Input
            name="fbFeed"
            type="number"
            min={0}
            max={10}
            defaultValue={fb.feed_per_day ?? 1}
          />
          <Label className="text-xs">Facebook stories / day</Label>
          <Input
            name="fbStories"
            type="number"
            min={0}
            max={10}
            defaultValue={fb.stories_per_day ?? 0}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">LinkedIn posts / day</Label>
          <Input
            name="liFeed"
            type="number"
            min={0}
            max={10}
            defaultValue={li.feed_per_day ?? 1}
          />
          <p className="text-[11px] text-muted-foreground">
            Only counts when LinkedIn is an enabled channel.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save cadence"}
        </Button>
        {message ? (
          <p className="text-xs text-muted-foreground">{message}</p>
        ) : null}
      </div>
    </form>
  );
}
