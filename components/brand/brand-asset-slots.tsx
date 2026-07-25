"use client";

import { useActionState } from "react";

import { uploadMediaAsset, type MediaActionResult } from "@/lib/media/actions";
import { BRAND_ASSET_TAGS, type MediaAsset } from "@/lib/types/media";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: MediaActionResult = {};

const SLOTS: Array<{
  tag: string;
  label: string;
  accept: string;
  type: "logo" | "font" | "document";
  hint: string;
}> = [
  {
    tag: BRAND_ASSET_TAGS.logoPrimary,
    label: "Primary logo",
    accept: "image/*",
    type: "logo",
    hint: "Main logo used in posts and reports",
  },
  {
    tag: BRAND_ASSET_TAGS.logoSecondary,
    label: "Secondary logo",
    accept: "image/*",
    type: "logo",
    hint: "Alternate mark / lockup",
  },
  {
    tag: BRAND_ASSET_TAGS.logoDark,
    label: "Logo (dark)",
    accept: "image/*",
    type: "logo",
    hint: "For light backgrounds",
  },
  {
    tag: BRAND_ASSET_TAGS.logoLight,
    label: "Logo (light)",
    accept: "image/*",
    type: "logo",
    hint: "For dark backgrounds",
  },
  {
    tag: BRAND_ASSET_TAGS.fontHeading,
    label: "Heading font file",
    accept: ".ttf,.otf,.woff,.woff2",
    type: "font",
    hint: "Optional font file upload",
  },
  {
    tag: BRAND_ASSET_TAGS.fontBody,
    label: "Body font file",
    accept: ".ttf,.otf,.woff,.woff2",
    type: "font",
    hint: "Optional font file upload",
  },
  {
    tag: BRAND_ASSET_TAGS.guidelinesDoc,
    label: "Brand guidelines PDF",
    accept: "application/pdf",
    type: "document",
    hint: "Uploading queues AI extraction as a reviewable diff",
  },
];

function SlotCard({
  brandId,
  slot,
  asset,
  canWrite,
}: {
  brandId: string;
  slot: (typeof SLOTS)[number];
  asset: MediaAsset | null;
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(uploadMediaAsset, initial);

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div>
        <h3 className="font-medium">{slot.label}</h3>
        <p className="text-sm text-muted-foreground">{slot.hint}</p>
      </div>
      {asset ? (
        <div className="space-y-2">
          {slot.type === "logo" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.public_url}
              alt={slot.label}
              className="max-h-24 object-contain"
            />
          ) : (
            <a
              href={asset.public_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline"
            >
              {asset.filename}
            </a>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not uploaded</p>
      )}
      {canWrite ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="brandId" value={brandId} />
          <input type="hidden" name="reservedTag" value={slot.tag} />
          <input type="hidden" name="type" value={slot.type} />
          <input type="hidden" name="tags" value={slot.tag} />
          <Label htmlFor={`slot-${slot.tag}`} className="sr-only">
            Upload {slot.label}
          </Label>
          <Input
            id={`slot-${slot.tag}`}
            name="file"
            type="file"
            accept={slot.accept}
            required
          />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Uploading…" : asset ? "Replace" : "Upload"}
          </Button>
          {state.error || state.success ? (
            <Alert variant={state.error ? "destructive" : "default"}>
              <AlertDescription>{state.error || state.success}</AlertDescription>
            </Alert>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

export function BrandAssetSlots({
  brandId,
  assets,
  canWrite,
}: {
  brandId: string;
  assets: MediaAsset[];
  canWrite: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Brand asset slots</h2>
        <p className="text-sm text-muted-foreground">
          Dedicated uploads for logos, fonts, and the guidelines PDF.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {SLOTS.map((slot) => {
          const asset =
            assets.find((a) => (a.tags ?? []).includes(slot.tag)) ?? null;
          return (
            <SlotCard
              key={slot.tag}
              brandId={brandId}
              slot={slot}
              asset={asset}
              canWrite={canWrite}
            />
          );
        })}
      </div>
    </div>
  );
}
