"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DirectMediaUpload } from "@/components/media/direct-media-upload";
import {
  deleteMediaAsset,
  registerUploadedMediaAsset,
  updateMediaAssetTags,
  type MediaActionResult,
} from "@/lib/media/actions";
import { uploadBrandMediaFromBrowser } from "@/lib/media/client-upload";
import {
  validateDirectUploadFile,
  type DirectUploadKind,
} from "@/lib/media/upload-constants";
import {
  MEDIA_TYPE_LABELS,
  type MediaAsset,
  type MediaAssetType,
} from "@/lib/types/media";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

function kindForFile(file: File): DirectUploadKind {
  if (file.type === "application/pdf") return "document";
  if (
    file.type.includes("font") ||
    /\.(ttf|otf|woff2?)$/i.test(file.name)
  ) {
    return "font";
  }
  return "media";
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
  const [typeFilter, setTypeFilter] = useState<MediaAssetType | "all">("all");
  const [tagQuery, setTagQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [tagState, tagAction, tagPending] = useActionState(
    updateMediaAssetTags,
    initial,
  );
  const [pending, startTransition] = useTransition();

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

  function uploadFiles(files: FileList | File[]) {
    if (!canWrite) return;
    const list = Array.from(files);
    setBulkError(null);
    startTransition(async () => {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const kind = kindForFile(file);
        const validation = validateDirectUploadFile(file, kind);
        if (validation) {
          setBulkError(`${file.name}: ${validation}`);
          continue;
        }
        setBulkProgress(`Uploading ${i + 1}/${list.length}: ${file.name}`);
        try {
          const uploaded = await uploadBrandMediaFromBrowser({
            organizationId,
            brandId,
            file,
            kind,
          });
          const fd = new FormData();
          fd.set("brandId", brandId);
          fd.set("storagePath", uploaded.storagePath);
          fd.set("filename", uploaded.filename);
          fd.set("mimeType", uploaded.mimeType);
          fd.set("sizeBytes", String(uploaded.sizeBytes));
          fd.set("type", uploaded.assetType);
          const result = await registerUploadedMediaAsset({}, fd);
          if (result.error) setBulkError(`${file.name}: ${result.error}`);
        } catch (error) {
          setBulkError(
            `${file.name}: ${error instanceof Error ? error.message : "Upload failed"}`,
          );
        }
      }
      setBulkProgress(null);
      router.refresh();
    });
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
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
          }}
        >
          <div>
            <h2 className="font-medium">Upload media</h2>
            <p className="text-sm text-muted-foreground">
              Drag and drop, or choose files. Uploads go directly to private
              storage (max 25MB for images/videos).
            </p>
          </div>
          <DirectMediaUpload
            organizationId={organizationId}
            brandId={brandId}
            kind="media"
            accept="image/*,video/*"
            label="Choose image or video"
            disabled={pending}
            onComplete={(result) => {
              if (result.error) setBulkError(result.error);
              else router.refresh();
            }}
          />
          {bulkProgress ? (
            <p className="text-sm text-muted-foreground">{bulkProgress}</p>
          ) : null}
          {bulkError ? (
            <Alert variant="destructive">
              <AlertDescription>{bulkError}</AlertDescription>
            </Alert>
          ) : null}
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

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No media assets yet.</p>
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
                  <Badge variant="outline">{MEDIA_TYPE_LABELS[asset.type]}</Badge>
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
  );
}
