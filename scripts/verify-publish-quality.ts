/**
 * Live verify: dead-link block + story-fit derive for Madyen.
 * Usage: npx tsx --require ./tmp/mock-server-only.cjs scripts/verify-publish-quality.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const ORG = "d559b1ea-b8ee-4d11-b7fa-812e74723789";
const BRAND = "aa83e007-f59a-471d-bdca-12ffe53d9c64";

function loadEnvLocal() {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const k = trimmed.slice(0, i);
    const v = trimmed.slice(i + 1);
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { validateContentLinks } = await import("../lib/content/link-allowlist");
  const { suitableFormatsForDimensions } = await import("../lib/media/format-fit");
  const { deriveStoryFittedAsset } = await import("../lib/media/story-fit");

  const supabase = createAdminClient();

  console.log("=== 1. Dead / invent link block ===");
  const dead = await validateContentLinks({
    organizationId: ORG,
    brandId: BRAND,
    copy: "See https://madyen.com/this-page-definitely-does-not-exist-xyz-999 and https://totally-fake-domain-growthos-test.invalid/path",
  });
  console.log(JSON.stringify(dead, null, 2));
  if (!dead.disallowed.length && !dead.unreachable.length) {
    throw new Error("Expected link check to fail for invent/dead URLs");
  }
  console.log("OK: publish would block\n");

  console.log("=== 2. Story-fit derive from non-9:16 ===");
  const { data: sources } = await supabase
    .from("media_assets")
    .select("id, width, height, filename, suitable_formats, is_derived")
    .eq("brand_id", BRAND)
    .eq("organization_id", ORG)
    .in("type", ["image", "logo"])
    .eq("is_derived", false)
    .not("width", "is", null)
    .order("created_at", { ascending: false })
    .limit(40);

  const source = (sources ?? []).find((s) => {
    const formats = (s.suitable_formats as string[]) ?? [];
    if (formats.includes("instagram_story")) return false;
    const fit = suitableFormatsForDimensions(s.width, s.height);
    return (
      !fit.includes("instagram_story") &&
      (s.width ?? 0) >= 200 &&
      (s.height ?? 0) >= 200
    );
  });

  if (!source) {
    console.warn(
      "No non-9:16 sourced with dimensions — will try any image >=200px after probe",
    );
    const { data: anyImg } = await supabase
      .from("media_assets")
      .select("id, width, height, filename")
      .eq("brand_id", BRAND)
      .eq("organization_id", ORG)
      .in("type", ["image", "logo"])
      .eq("is_derived", false)
      .order("created_at", { ascending: false })
      .limit(20);
    const fallback = (anyImg ?? [])[0];
    if (!fallback) throw new Error("No Madyen images to derive from");
    const derived = await deriveStoryFittedAsset({
      organizationId: ORG,
      brandId: BRAND,
      sourceAssetId: fallback.id,
    });
    if (!derived) throw new Error("deriveStoryFittedAsset returned null");
    await assertDerived(supabase, derived.assetId, fallback.id);
  } else {
    console.log(
      `Source ${source.id} ${source.width}x${source.height} ${source.filename}`,
    );
    const derived = await deriveStoryFittedAsset({
      organizationId: ORG,
      brandId: BRAND,
      sourceAssetId: source.id,
    });
    if (!derived) throw new Error("deriveStoryFittedAsset returned null");
    await assertDerived(supabase, derived.assetId, source.id);
  }

  console.log("All verify checks passed.");
}

async function assertDerived(
  supabase: ReturnType<
    Awaited<typeof import("../lib/supabase/admin")>["createAdminClient"]
  >,
  assetId: string,
  sourceId: string,
) {
  const { data: row } = await supabase
    .from("media_assets")
    .select(
      "id, width, height, suitable_formats, is_derived, derived_from_asset_id",
    )
    .eq("id", assetId)
    .single();
  console.log("Derived:", row);
  if (
    !row ||
    row.width !== 1080 ||
    row.height !== 1920 ||
    !row.is_derived ||
    row.derived_from_asset_id !== sourceId
  ) {
    throw new Error(
      "Derived asset missing expected 1080x1920 / is_derived flags",
    );
  }
  console.log("OK: story-fit derived\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
