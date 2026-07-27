"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  DirectMediaUpload,
  type DirectMediaUploadHandle,
} from "@/components/media/direct-media-upload";
import {
  deleteMediaAsset,
  updateMediaAssetTags,
  type MediaActionResult,
} from "@/lib/media/actions";
import {
  MEDIA_TYPE_LABELS,
  type MediaAsset,
  type MediaAssetType,
} from "@/lib/types/media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: MediaActionResult = {};

const TYPE_FILTERS: Array<MediaAssetType | "all"> = [
  "all",
  "image",
  "logo",
  "video",
  "document",
  "font",
];

function isPreviewable(asset: MediaAsset) {
  return (
    asset.type === "image" ||
    asset.type === "logo" ||
    (asset.mime_type?.startsWith("image/") ?? false)
  );
}

function collectDroppedFiles(dataTransfer: DataTransfer): File[] {
  const fromList = Array.from(dataTransfer.files ?? []);
  if (fromList.length) return fromList;
  // Fallback for some browsers that only populate items
  const fromItems: File[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) fromItems.push(file);
    }
  }
  return fromItems;
}

export function MediaLibraryPanel({
  brandId,
  organizationId,
  assets,
  canWrite,
}: {
  brandId: string;
  organizationId: string;
  assets: MediaAsset[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const uploadRef = useRef<DirectMediaUploadHandle>(null);
  const [typeFilter, setTypeFilter] = useState<MediaAssetType | "all">("all");
  const [tagQuery, setTagQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [tagState, tagAction, tagPending] = useActionState(
    updateMediaAssetTags,
    initial,
  );

  const filtered = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    return assets.filter((a) => {
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      if (!q) return true;
      return (
        a.filename.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q) ||
        (a.ai_subject ?? "").toLowerCase().includes(q) ||
        (a.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
        (a.suitable_for ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [assets, typeFilter, tagQuery]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!canWrite) return;
    const files = collectDroppedFiles(e.dataTransfer);
    if (files.length) uploadRef.current?.enqueueFiles(files);
  }

  return (
    <div className="space-y-6">
      {canWrite ? (
        <div
          className={`space-y-3 rounded-xl border border-dashed p-6 transition-colors ${
            dragOver ? "border-foreground bg-muted/40" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div>
            <h2 className="font-medium">Upload media</h2>
            <p className="text-sm text-muted-foreground">
              Drag and drop multiple files, or choose several at once. Uploads
              go directly to private storage (max 25MB each).
            </p>
          </div>
          <DirectMediaUpload
            ref={uploadRef}
            organizationId={organizationId}
            brandId={brandId}
            kind="media"
            multiple
            accept="image/*,video/*"
            label="Choose images or videos"
            onBatchComplete={() => router.refresh()}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label>Type</Label>
          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={typeFilter === t ? "default" : "outline"}
                onClick={() => setTypeFilter(t)}
              >
                {t === "all" ? "All" : MEDIA_TYPE_LABELS[t]}
              </Button>
            ))}
          </div>
        </div>
        <div className="min-w-[200px] flex-1 space-y-2">
          <Label htmlFor="search">Search filename / tag</Label>
          <Input
            id="search"
            value={tagQuery}
            onChange={(e) => setTagQuery(e.target.value)}
            placeholder="logo, guidelines…"
          />
        </div>
      </div>

      <div
        className={`rounded-xl transition-colors ${
          dragOver && canWrite ? "ring-2 ring-foreground/30" : ""
        }`}
        onDragOver={(e) => {
          if (!canWrite) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No media assets yet.
            {canWrite ? " Drop files here to upload." : ""}
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((asset) => (
              <li key={asset.id} className="space-y-3 rounded-xl border p-3">
                <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
                  {isPreviewable(asset) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.public_url}
                      alt={asset.filename}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      {MEDIA_TYPE_LABELS[asset.type]}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="truncate text-sm font-medium">{asset.filename}</p>
                  {asset.description ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {asset.description}
                    </p>
                  ) : asset.ai_tagged_at ? null : (
                    <p className="text-xs text-muted-foreground">
                      AI tagging pending…
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">
                      {MEDIA_TYPE_LABELS[asset.type]}
                    </Badge>
                    {(asset.tags ?? []).map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(asset.size_bytes / 1024)} KB
                  </p>
                </div>
                {canWrite ? (
                  <div className="space-y-2">
                    <form action={tagAction} className="flex gap-2">
                      <input type="hidden" name="assetId" value={asset.id} />
                      <Input
                        name="tags"
                        defaultValue={(asset.tags ?? []).join(", ")}
                        placeholder="tags"
                        className="h-8"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={tagPending}
                      >
                        Save
                      </Button>
                    </form>
                    {tagState.error ? (
                      <p className="text-xs text-destructive">{tagState.error}</p>
                    ) : null}
                    <div className="flex gap-2">
                      <a
                        href={asset.public_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline"
                      >
                        Open
                      </a>
                      <form action={deleteMediaAsset}>
                        <input type="hidden" name="assetId" value={asset.id} />
                        <button
                          type="submit"
                          className="text-xs text-destructive underline"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
