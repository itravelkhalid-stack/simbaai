import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "content-media";
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function uploadContentMediaFile(params: {
  organizationId: string;
  brandId: string;
  contentItemId: string;
  file: File;
}): Promise<{ publicUrl: string; path: string }> {
  if (!ALLOWED.has(params.file.type)) {
    throw new Error("Only JPEG, PNG, WebP, or GIF images are allowed");
  }
  if (params.file.size > MAX_BYTES) {
    throw new Error("Image must be 8MB or smaller");
  }

  const ext =
    params.file.type === "image/png"
      ? "png"
      : params.file.type === "image/webp"
        ? "webp"
        : params.file.type === "image/gif"
          ? "gif"
          : "jpg";

  const path = `${params.organizationId}/${params.brandId}/${params.contentItemId}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await params.file.arrayBuffer());
  const supabase = createAdminClient();

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: params.file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("Failed to resolve public media URL");

  return { publicUrl: data.publicUrl, path };
}
