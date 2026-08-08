export type MediaAssetType = "image" | "video" | "logo" | "document" | "font";
export type MediaAssetSource = "upload" | "ai";
export type BrandGuidelinesProposalStatus = "pending" | "approved" | "rejected";

/** Reserved tags for brand asset slots */
export const BRAND_ASSET_TAGS = {
  logoPrimary: "logo-primary",
  logoSecondary: "logo-secondary",
  logoDark: "logo-dark",
  logoLight: "logo-light",
  fontHeading: "font-heading",
  fontBody: "font-body",
  guidelinesDoc: "guidelines-doc",
} as const;

export type BrandAssetTag =
  (typeof BRAND_ASSET_TAGS)[keyof typeof BRAND_ASSET_TAGS];

export type MediaAsset = {
  id: string;
  organization_id: string;
  brand_id: string;
  type: MediaAssetType;
  storage_path: string;
  public_url: string;
  filename: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number;
  tags: string[];
  description: string | null;
  ai_subject: string | null;
  ai_style: string | null;
  ai_colors: string[];
  suitable_for: string[];
  /** Format slots from dimensions: instagram_story, instagram_feed, etc. */
  suitable_formats: string[];
  is_derived: boolean;
  derived_from_asset_id: string | null;
  ai_tagged_at: string | null;
  source: MediaAssetSource;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Client-safe direct-upload limit (browser → Supabase Storage). */
export const MAX_MEDIA_UPLOAD_BYTES = 25 * 1024 * 1024;

export type ContentItemMedia = {
  id: string;
  organization_id: string;
  content_item_id: string;
  media_asset_id: string;
  sort_order: number;
  created_at: string;
};

export type BrandGuidelinesProposal = {
  id: string;
  organization_id: string;
  brand_id: string;
  media_asset_id: string | null;
  agent_run_id: string | null;
  status: BrandGuidelinesProposalStatus;
  proposed: Record<string, unknown>;
  current_snapshot: Record<string, unknown>;
  summary: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BrandAssetSlotUrls = {
  logoPrimary: string | null;
  logoSecondary: string | null;
  logoDark: string | null;
  logoLight: string | null;
  guidelinesDoc: string | null;
};

export const MEDIA_TYPE_LABELS: Record<MediaAssetType, string> = {
  image: "Image",
  video: "Video",
  logo: "Logo",
  document: "Document",
  font: "Font",
};
