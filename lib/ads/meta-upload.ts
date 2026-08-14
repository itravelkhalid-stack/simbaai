import "server-only";

import {
  brandMediaStoragePathFromUrl,
  validateMetaAdImage,
} from "@/lib/ads/meta-image";
import { formatAdsApiError } from "@/lib/ads/providers/http";

const META_GRAPH = "https://graph.facebook.com/v21.0";

function metaActId(accountId: string) {
  return accountId.startsWith("act_") ? accountId : `act_${accountId}`;
}

async function loadCreativeImageBytes(imageUrl: string): Promise<{
  bytes: Buffer;
  known?: { width?: number | null; height?: number | null };
}> {
  const storagePath = brandMediaStoragePathFromUrl(imageUrl);
  if (storagePath) {
    // Private brand-media bucket — public URLs 400 with Bucket not found / Forbidden.
    // Download via service role so Meta never needs to fetch our storage.
    const { downloadBrandMediaBytes } = await import("@/lib/media/storage");
    try {
      const downloaded = await downloadBrandMediaBytes(storagePath);
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const supabase = createAdminClient();
      const { data: asset } = await supabase
        .from("media_assets")
        .select("width, height")
        .eq("storage_path", storagePath)
        .maybeSingle();
      return {
        bytes: downloaded.bytes,
        known: { width: asset?.width, height: asset?.height },
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not read creative from brand-media (${storagePath}): ${detail}`,
      );
    }
  }

  const image = await fetch(imageUrl, {
    signal: AbortSignal.timeout(20_000),
  });
  const buffer = Buffer.from(await image.arrayBuffer());
  if (!image.ok) {
    const bodyText = buffer.toString("utf8").slice(0, 500).trim();
    let detail = bodyText || image.statusText || "unknown";
    try {
      const parsed = JSON.parse(bodyText) as {
        message?: string;
        error?: string;
        code?: string;
      };
      detail = parsed.message || parsed.error || parsed.code || detail;
    } catch {
      // keep raw snippet
    }
    throw new Error(
      `Creative image download failed HTTP ${image.status}: ${detail}`,
    );
  }
  const contentType = image.headers.get("content-type") ?? "";
  if (
    contentType &&
    !contentType.startsWith("image/") &&
    !contentType.includes("octet-stream")
  ) {
    throw new Error(
      `Creative URL must serve an image, got ${contentType || "unknown"}`,
    );
  }
  return { bytes: buffer };
}

/**
 * Upload image BYTES to act_{id}/adimages (multipart). Never pass a URL to Meta.
 */
export async function uploadMetaAdImage(params: {
  accountId: string;
  accessToken: string;
  imageUrl: string;
}): Promise<string> {
  const raw = await loadCreativeImageBytes(params.imageUrl);
  const validated = validateMetaAdImage(raw.bytes, raw.known);

  const form = new FormData();
  form.append("access_token", params.accessToken);
  form.append(
    "filename",
    new Blob([new Uint8Array(validated.uploadBytes)], {
      type: validated.mimeType,
    }),
    validated.filename,
  );

  const url = `${META_GRAPH}/${metaActId(params.accountId)}/adimages`;
  const res = await fetch(url, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(
      `Meta adimages upload failed — ${formatAdsApiError(body ?? text, res.status)}`,
    );
  }
  if (
    typeof body === "object" &&
    body != null &&
    "error" in body &&
    (body as { error: unknown }).error
  ) {
    throw new Error(
      `Meta adimages upload failed — ${formatAdsApiError(body)}`,
    );
  }

  const uploaded = body as {
    images?: Record<string, { hash?: string }>;
  };
  const hash = Object.values(uploaded.images ?? {})[0]?.hash;
  if (!hash) {
    throw new Error(
      `Meta image upload did not return an image hash. Response: ${text.slice(0, 400)}`,
    );
  }
  return hash;
}
