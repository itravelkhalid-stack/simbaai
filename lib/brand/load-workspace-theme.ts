import "server-only";

import { resolveWorkspaceTheme, type WorkspaceTheme } from "@/lib/brand/theme";
import { createClient } from "@/lib/supabase/server";

export async function loadWorkspaceTheme(
  organizationId: string,
  organizationName: string,
): Promise<WorkspaceTheme> {
  const supabase = await createClient();

  let { data: brand } = await supabase
    .from("brands")
    .select(
      "id, name, logo_url, primary_color, secondary_color, accent_color",
    )
    .eq("organization_id", organizationId)
    .eq("is_primary", true)
    .maybeSingle();

  if (!brand) {
    const { data: fallback } = await supabase
      .from("brands")
      .select(
        "id, name, logo_url, primary_color, secondary_color, accent_color",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    brand = fallback;
  }

  let logoUrl = brand?.logo_url ?? null;
  if (brand?.id) {
    const { data: mediaRows } = await supabase
      .from("media_assets")
      .select("public_url, tags")
      .eq("organization_id", organizationId)
      .eq("brand_id", brand.id)
      .overlaps("tags", ["logo-primary"]);
    const primary = (mediaRows ?? []).find((a) =>
      (a.tags ?? []).includes("logo-primary"),
    );
    if (primary?.public_url) logoUrl = primary.public_url;
  }

  return resolveWorkspaceTheme({
    brandId: brand?.id,
    brandName: brand?.name,
    logoUrl,
    primaryColor: brand?.primary_color,
    secondaryColor: brand?.secondary_color,
    accentColor: brand?.accent_color,
    organizationName,
  });
}
