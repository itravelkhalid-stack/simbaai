"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DirectMediaUpload } from "@/components/media/direct-media-upload";
import {
  attachMediaToContentItem,
  type MediaActionResult,
} from "@/lib/media/actions";
import type { MediaAsset } from "@/lib/types/media";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function isPreviewable(asset: MediaAsset) {
  return (
    asset.type === "image" ||
    asset.type === "logo" ||
    (asset.mime_type?.startsWith("image/") ?? false)
  );
}

export function MediaLibraryPicker({
  itemId,
  brandId,
  organizationId,
  assets,
  canWrite,
  triggerLabel = "Choose from library",
  replace = true,
  compact = false,
}: {
  itemId: string;
  brandId: string;
  organizationId: string;
  assets: MediaAsset[];
  canWrite: boolean;
  triggerLabel?: string;
  replace?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [message, setMessage] = useState<MediaActionResult>({});
  const [pending, startTransition] = useTransition();

  const attachable = useMemo(
    () =>
      assets.filter(
        (a) => a.type === "image" || a.type === "logo" || a.type === "video",
      ),
    [assets],
  );

  const filtered = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    if (!q) return attachable;
    return attachable.filter(
      (a) =>
        a.filename.toLowerCase().includes(q) ||
        (a.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
        (a.description ?? "").toLowerCase().includes(q) ||
        (a.suitable_for ?? []).some((t) => t.toLowerCase().includes(q)) ||
        (a.ai_subject ?? "").toLowerCase().includes(q),
    );
  }, [attachable, tagQuery]);

  if (!canWrite) return null;

  function selectAsset(assetId: string) {
    setMessage({});
    startTransition(async () => {
      const fd = new FormData();
      fd.set("itemId", itemId);
      fd.set("assetId", assetId);
      if (replace) fd.set("replace", "1");
      const result = await attachMediaToContentItem({}, fd);
      setMessage(result);
      if (!result.error) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={
          compact
            ? "inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent"
            : "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>Brand media library</DialogTitle>
          <DialogDescription>
            Attach an existing asset, or upload new into the library then attach.
            Files go directly to storage — the app only saves metadata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`media-search-${itemId}`}>Search by tag</Label>
            <Input
              id={`media-search-${itemId}`}
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder="beach, offer, product…"
            />
          </div>

          <div className="rounded-lg border border-dashed p-3">
            <DirectMediaUpload
              organizationId={organizationId}
              brandId={brandId}
              itemId={itemId}
              replace={replace}
              tags="content"
              kind="media"
              multiple
              accept="image/*,video/*"
              label="Upload new"
              hint="Images & videos, max 25MB each. Multi-select supported. Saved to Brand → Media, then attached."
              disabled={pending}
              onBatchComplete={() => {
                setOpen(false);
                router.refresh();
              }}
              onComplete={(result) => {
                setMessage(result);
              }}
            />
          </div>

          {message.error || message.success ? (
            <Alert variant={message.error ? "destructive" : "default"}>
              <AlertDescription>
                {message.error ?? message.success}
              </AlertDescription>
            </Alert>
          ) : null}

          {pending ? (
            <p className="text-sm text-muted-foreground">Attaching…</p>
          ) : null}

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No matching library images. Upload one above or add assets in Brand
              → Media.
            </p>
          ) : (
            <ul className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
              {filtered.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => selectAsset(asset.id)}
                    className="w-full space-y-1 rounded-lg border p-2 text-left transition-colors hover:border-foreground disabled:opacity-50"
                  >
                    <div className="aspect-video overflow-hidden rounded bg-muted">
                      {isPreviewable(asset) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={asset.public_url}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                          {asset.type}
                        </div>
                      )}
                    </div>
                    <p className="truncate text-xs font-medium">{asset.filename}</p>
                    {(asset.tags ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(asset.tags ?? []).slice(0, 3).map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
