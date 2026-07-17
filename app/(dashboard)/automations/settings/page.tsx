import { AutomationsNav } from "@/components/automations/automations-nav";
import { AutomationSettingsForm } from "@/components/automations/settings-form";
import { getBrandAutomationSettings } from "@/lib/automations/safety";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";

export default async function AutomationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string }>;
}) {
  const { active } = await requireActiveOrg();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .eq("organization_id", active.organization_id)
    .order("name");
  const brandId = params.brandId || brands?.[0]?.id;

  if (!brandId) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          Automation settings
        </h1>
        <p className="text-sm text-muted-foreground">Create a brand first.</p>
      </div>
    );
  }

  const settings = await getBrandAutomationSettings({
    organizationId: active.organization_id,
    brandId,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Automation safety settings
        </h1>
        <p className="mt-2 text-muted-foreground">
          Auto-publish allowlist and daily budget caps for resume/spend actions.
        </p>
      </div>
      <AutomationsNav current="/automations/settings" />
      <div className="flex flex-wrap gap-2">
        {(brands ?? []).map((b) => (
          <a
            key={b.id}
            href={`/automations/settings?brandId=${b.id}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              b.id === brandId ? "bg-foreground text-background" : ""
            }`}
          >
            {b.name}
          </a>
        ))}
      </div>
      <AutomationSettingsForm brandId={brandId} settings={settings} />
    </div>
  );
}
