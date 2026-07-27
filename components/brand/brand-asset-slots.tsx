"use client";

import { useRouter } from "next/navigation";

import { DirectMediaUpload } from "@/components/media/direct-media-upload";
import { BRAND_ASSET_TAGS, type MediaAsset } from "@/lib/types/media";
import type { DirectUploadKind } from "@/lib/media/upload-constants";

const SLOTS: Array<{
  tag: string;
  label: string;
  accept: string;
  type: "logo" | "font" | "document";
  kind: DirectUploadKind;
  hint: string;
}> = [
  {
    tag: BRAND_ASSET_TAGS.logoPrimary,
    label: "Primary logo",
    accept: "image/*",
    type: "logo",
    kind: "logo",
    hint: "Main logo used in posts and reports",
  },
  {
    tag: BRAND_ASSET_TAGS.logoSecondary,
    label: "Secondary logo",
    accept: "image/*",
    type: "logo",
    kind: "logo",
    hint: "Alternate mark / lockup",
  },
  {
    tag: BRAND_ASSET_TAGS.logoDark,
    label: "Logo (dark)",
    accept: "image/*",
    type: "logo",
    kind: "logo",
    hint: "For light backgrounds",
  },
  {
    tag: BRAND_ASSET_TAGS.logoLight,
    label: "Logo (light)",
    accept: "image/*",
    type: "logo",
    kind: "logo",
    hint: "For dark backgrounds",
  },
  {
    tag: BRAND_ASSET_TAGS.fontHeading,
    label: "Heading font file",
    accept: ".ttf,.otf,.woff,.woff2",
    type: "font",
    kind: "font",
    hint: "Optional font file upload",
  },
  {
    tag: BRAND_ASSET_TAGS.fontBody,
    label: "Body font file",
    accept: ".ttf,.otf,.woff,.woff2",
    type: "font",
    kind: "font",
    hint: "Optional font file upload",
  },
  {
    tag: BRAND_ASSET_TAGS.guidelinesDoc,
    label: "Brand guidelines PDF",
    accept: "application/pdf",
    type: "document",
    kind: "document",
    hint: "Uploading queues AI extraction as a reviewable diff",
  },
];

function SlotCard({
  brandId,
  organizationId,
  slot,
  asset,
  canWrite,
}: {
  brandId: string;
  organizationId: string;
  slot: (typeof SLOTS)[number];
  asset: MediaAsset | null;
  canWrite: boolean;
}) {
  const router = useRouter();

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
        <DirectMediaUpload
          organizationId={organizationId}
          brandId={brandId}
          kind={slot.kind}
          reservedTag={slot.tag}
          type={slot.type}
          tags={slot.tag}
          accept={slot.accept}
          multiple={false}
          label={asset ? "Replace" : "Upload"}
          hint={
            slot.kind === "font"
              ? "Max 8MB. Uploads go directly to storage."
              : "Max 25MB. Uploads go directly to storage."
          }
          onComplete={(result) => {
            if (!result.error) router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

export function BrandAssetSlots({
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
              organizationId={organizationId}
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
