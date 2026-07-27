import { ContentNav } from "@/components/content/content-nav";
import { GenerateForms } from "@/components/content/generate-forms";
import { getBrandEnabledContentPlatforms } from "@/lib/brand/channels";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { ContentPillar } from "@/lib/types/content";

export default async function ContentGeneratePage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: pillars } = await supabase
    .from("content_pillars")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("name");

  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("organization_id", active.organization_id)
    .eq("is_primary", true)
    .maybeSingle();

  let brandId = brand?.id as string | undefined;
  if (!brandId) {
    const { data: fallback } = await supabase
      .from("brands")
      .select("id")
      .eq("organization_id", active.organization_id)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    brandId = fallback?.id;
  }

  const enabledPlatforms = brandId
    ? await getBrandEnabledContentPlatforms({
        organizationId: active.organization_id,
        brandId,
      })
    : (["facebook", "instagram"] as const);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Generate</h1>
        <p className="mt-2 text-muted-foreground">
          Every run injects brand context — voice, audiences, pillars, and
          competitor notes. Platforms follow Brand → Channels.
        </p>
      </div>
      <ContentNav current="/content/generate" />
      <GenerateForms
        pillars={(pillars ?? []) as ContentPillar[]}
        enabledPlatforms={[...enabledPlatforms]}
      />
    </div>
  );
}
