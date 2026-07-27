import { notFound } from "next/navigation";

import { BrandChannelsForm } from "@/components/brand/channels-form";
import { BrandNav } from "@/components/brand/brand-nav";
import {
  deriveConnectedChannels,
  type BrandChannel,
} from "@/lib/brand/channels";
import { normalizeBrandChannels } from "@/lib/brand/channel-types";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Brand } from "@/lib/types/research";

export default async function BrandChannelsPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string }>;
}) {
  const params = await searchParams;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const canWrite = active.role !== "org_viewer";

  let brandQuery = supabase
    .from("brands")
    .select("*")
    .eq("organization_id", active.organization_id);

  if (params.brandId) {
    brandQuery = brandQuery.eq("id", params.brandId);
  } else {
    brandQuery = brandQuery.eq("is_primary", true);
  }

  let { data: brand } = await brandQuery.maybeSingle();
  if (!brand) {
    const { data: fallback } = await supabase
      .from("brands")
      .select("*")
      .eq("organization_id", active.organization_id)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    brand = fallback;
  }
  if (!brand) notFound();

  const typed = brand as Brand & { enabled_channels?: string[] };
  const connected = await deriveConnectedChannels({
    organizationId: active.organization_id,
    brandId: typed.id,
  });
  const stored = normalizeBrandChannels(typed.enabled_channels);
  // Show connected as the effective selection when nothing is explicitly saved
  const selected: BrandChannel[] =
    stored.length > 0 ? stored : connected;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Channels</h1>
        <p className="mt-2 text-muted-foreground">
          Limit content generation and planning to the platforms this brand
          actually operates.
        </p>
      </div>
      <BrandNav current="/brand/channels" />
      <BrandChannelsForm
        brandId={typed.id}
        brandName={typed.name}
        selected={selected}
        connected={connected}
        canWrite={canWrite}
      />
    </div>
  );
}
