import { ClearUnpublishedQueueForm } from "@/components/content/clear-unpublished-queue-form";
import { ContentCadenceForm } from "@/components/content/content-cadence-form";
import { ContentCalendar } from "@/components/content/content-calendar";
import { ContentNav } from "@/components/content/content-nav";
import { PageHeader } from "@/components/dashboard/page-header";
import { parseContentCadence } from "@/lib/content/cadence";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { ContentItem } from "@/lib/types/content";

export default async function ContentCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string }>;
}) {
  const { active } = await requireActiveOrg();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: brands } = await supabase
    .from("brands")
    .select("id, name, content_cadence")
    .eq("organization_id", active.organization_id)
    .order("name");

  const brandId = params.brandId || brands?.[0]?.id;
  const brand = (brands ?? []).find((b) => b.id === brandId) ?? brands?.[0];

  const query = supabase
    .from("content_items")
    .select("*")
    .eq("organization_id", active.organization_id)
    .not("scheduled_at", "is", null)
    .in("status", [
      "scheduled",
      "published",
      "publish_failed",
      "approved",
      "pending_approval",
    ])
    .order("scheduled_at", { ascending: true });

  if (brandId) {
    query.eq("brand_id", brandId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content calendar"
        description="Feed and story slots by day · drag to reschedule · cadence fill keeps 7 days ahead."
      />
      <ContentNav current="/content/calendar" />

      {(brands ?? []).length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {(brands ?? []).map((b) => (
            <a
              key={b.id}
              href={`/content/calendar?brandId=${b.id}`}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                b.id === brandId ? "bg-foreground text-background" : ""
              }`}
            >
              {b.name}
            </a>
          ))}
        </div>
      ) : null}

      {brand && active.role !== "org_viewer" ? (
        <ContentCadenceForm
          brandId={brand.id}
          brandName={brand.name}
          initial={parseContentCadence(brand.content_cadence)}
        />
      ) : null}

      {brand &&
      (active.role === "org_owner" || active.role === "org_admin") ? (
        <ClearUnpublishedQueueForm
          brandId={brand.id}
          brandName={brand.name}
        />
      ) : null}

      <ContentCalendar
        items={(data ?? []) as ContentItem[]}
        canWrite={active.role !== "org_viewer"}
      />
    </div>
  );
}
