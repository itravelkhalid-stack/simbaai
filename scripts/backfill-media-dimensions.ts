/**
 * Backfill width/height + suitable_formats for every image/logo in media_assets.
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
      let v = trimmed.slice(i + 1);
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    // ignore
  }
}

const PAGE = 100;

async function main() {
  loadEnvLocal();
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { probeAndUpdateAssetDimensions } = await import(
    "../lib/media/story-fit"
  );
  const { assetQualifiesForSlot } = await import(
    "../lib/media/format-fit"
  );
  const supabase = createAdminClient();

  const { count: totalImages } = await supabase
    .from("media_assets")
    .select("id", { count: "exact", head: true })
    .in("type", ["image", "logo"]);

  console.log(`Probing ${totalImages ?? 0} image/logo assets…`);
  let offset = 0;
  let ok = 0;
  let fail = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  while (true) {
    const { data: rows, error } = await supabase
      .from("media_assets")
      .select("id")
      .in("type", ["image", "logo"])
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!rows?.length) break;

    for (const row of rows) {
      try {
        const result = await probeAndUpdateAssetDimensions(row.id);
        if (result.width && result.height) {
          ok += 1;
        } else {
          fail += 1;
          failures.push({ id: row.id, reason: "no dimensions" });
        }
      } catch (err) {
        fail += 1;
        failures.push({
          id: row.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    offset += rows.length;
    console.log(`… ${offset}/${totalImages ?? "?"}`);
    if (rows.length < PAGE) break;
  }

  const { data: all } = await supabase
    .from("media_assets")
    .select(
      "id, organization_id, brand_id, width, height, suitable_formats, is_derived, type",
    )
    .in("type", ["image", "logo"]);

  const slots = [
    "instagram_story",
    "instagram_feed",
    "facebook_story",
    "facebook_feed",
    "linkedin_feed",
  ] as const;

  function tally(
    rows: typeof all,
    label: string,
  ) {
    const images = (rows ?? []).filter((a) => !a.is_derived);
    const withDims = images.filter((a) => a.width && a.height);
    const missing = images.length - withDims.length;
    const counts: Record<string, number> = {};
    for (const slot of slots) {
      counts[slot] = images.filter((a) =>
        assetQualifiesForSlot({
          suitableFormats: (a.suitable_formats as string[]) ?? [],
          width: a.width,
          height: a.height,
          slot,
        }),
      ).length;
    }
    return {
      label,
      images: images.length,
      withDims: withDims.length,
      missingDims: missing,
      derivedExcluded: (rows ?? []).filter((a) => a.is_derived).length,
      qualifies: counts,
    };
  }

  const madyenOrg = "d559b1ea-b8ee-4d11-b7fa-812e74723789";
  const madyenBrand = "aa83e007-f59a-471d-bdca-12ffe53d9c64";

  const report = {
    probe: { ok, fail, failures: failures.slice(0, 20) },
    allOrgs: tally(all, "all orgs"),
    madyen: tally(
      (all ?? []).filter(
        (a) => a.organization_id === madyenOrg && a.brand_id === madyenBrand,
      ),
      "Madyen brand library",
    ),
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
