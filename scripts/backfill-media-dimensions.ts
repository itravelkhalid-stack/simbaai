/**
 * Backfill width/height + suitable_formats for existing media_assets.
 * Usage: npx tsx --require ./tmp/mock-server-only.cjs scripts/backfill-media-dimensions.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const i = trimmed.indexOf("=");
      const k = trimmed.slice(0, i);
      const v = trimmed.slice(i + 1);
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    // ignore
  }
}

async function main() {
  loadEnvLocal();
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { probeAndUpdateAssetDimensions } = await import("../lib/media/story-fit");
  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from("media_assets")
    .select("id, width, height, suitable_formats, type, mime_type")
    .in("type", ["image", "logo"])
    .or("width.is.null,height.is.null,suitable_formats.eq.{}")
    .limit(500);
  if (error) throw error;

  console.log(`Probing ${rows?.length ?? 0} assets…`);
  let ok = 0;
  let fail = 0;
  for (const row of rows ?? []) {
    try {
      const result = await probeAndUpdateAssetDimensions(row.id);
      if (result.width && result.height) {
        ok += 1;
        console.log(
          `${row.id}: ${result.width}x${result.height} → ${result.suitable_formats.join(",")}`,
        );
      } else {
        fail += 1;
        console.warn(`${row.id}: no dimensions`);
      }
    } catch (err) {
      fail += 1;
      console.warn(row.id, err);
    }
  }
  console.log(`Done. ok=${ok} fail=${fail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
