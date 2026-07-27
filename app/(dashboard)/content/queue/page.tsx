import { ContentNav } from "@/components/content/content-nav";
import { ReviewQueueCards } from "@/components/content/review-queue-cards";
import { PageHeader } from "@/components/dashboard/page-header";
import { ResearchRunProgress } from "@/components/research/run-progress";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { AgentRun } from "@/lib/types/database";
import type { ContentItem } from "@/lib/types/content";
import type { MediaAsset } from "@/lib/types/media";

export default async function ContentQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const params = await searchParams;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const canWrite = active.role !== "org_viewer";

  const { data: items, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("organization_id", active.organization_id)
    .in("status", ["pending_approval", "rejected", "draft"])
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  const typedItems = (items ?? []) as ContentItem[];
  const brandIds = Array.from(new Set(typedItems.map((i) => i.brand_id)));

  const libraryByBrand: Record<string, MediaAsset[]> = {};
  if (brandIds.length > 0) {
    const { data: assets } = await supabase
      .from("media_assets")
      .select("*")
      .eq("organization_id", active.organization_id)
      .in("brand_id", brandIds)
      .in("type", ["image", "logo", "video"])
      .order("created_at", { ascending: false })
      .limit(200);

    const { createBrandMediaSignedUrl } = await import("@/lib/media/storage");
    for (const asset of (assets ?? []) as MediaAsset[]) {
      let signed = asset;
      try {
        const url = await createBrandMediaSignedUrl(asset.storage_path);
        signed = { ...asset, public_url: url };
      } catch {
        // keep stored URL
      }
      const list = libraryByBrand[asset.brand_id] ?? [];
      list.push(signed);
      libraryByBrand[asset.brand_id] = list;
    }
  }

  let run: AgentRun | null = null;
  if (params.run) {
    const { data } = await supabase
      .from("agent_runs")
      .select("*")
      .eq("id", params.run)
      .eq("organization_id", active.organization_id)
      .maybeSingle();
    run = data;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review queue"
        description="Approve, edit inline, or reject with reasons for regeneration."
      />
      <ContentNav current="/content/queue" />
      {run ? <ResearchRunProgress runId={run.id} initialRun={run} /> : null}
      <ReviewQueueCards
        items={typedItems}
        libraryByBrand={libraryByBrand}
        canWrite={canWrite}
        organizationId={active.organization_id}
      />
    </div>
  );
}
