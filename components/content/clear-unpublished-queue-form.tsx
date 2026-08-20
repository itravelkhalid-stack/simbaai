"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearUnpublishedContentQueue } from "@/lib/content/actions";

export function ClearUnpublishedQueueForm({
  brandId,
  brandName,
}: {
  brandId: string;
  brandName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");

  return (
    <form
      className="space-y-3 rounded-xl border border-destructive/30 p-4"
      action={(formData) => {
        startTransition(async () => {
          const result = await clearUnpublishedContentQueue(formData);
          setMessage(result.error ?? result.success ?? null);
          if (result.success) setConfirm("");
        });
      }}
    >
      <div>
        <h2 className="text-sm font-medium text-destructive">
          Clear unpublished queue
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Deletes every draft, pending, approved, scheduled, rejected, and
          failed item for {brandName}. Published posts and their metrics are
          kept. This cannot be undone.
        </p>
      </div>
      <input type="hidden" name="brandId" value={brandId} />
      <div className="space-y-2">
        <Label htmlFor={`clear-queue-${brandId}`} className="text-xs">
          Type CLEAR to confirm
        </Label>
        <Input
          id={`clear-queue-${brandId}`}
          name="confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="CLEAR"
          autoComplete="off"
          className="max-w-xs"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          size="sm"
          variant="destructive"
          disabled={pending || confirm !== "CLEAR"}
        >
          {pending ? "Clearing…" : "Clear unpublished queue"}
        </Button>
        {message ? (
          <p className="text-xs text-muted-foreground">{message}</p>
        ) : null}
      </div>
    </form>
  );
}
