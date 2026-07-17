import { ComplianceNav } from "@/components/compliance/compliance-nav";
import { ComplianceProfileForm } from "@/components/compliance/profile-form";
import { getOrCreateComplianceProfile } from "@/lib/compliance/check";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";

export default async function ComplianceProfilePage({
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
          Compliance profile
        </h1>
        <p className="text-sm text-muted-foreground">Create a brand first.</p>
      </div>
    );
  }

  const profile = await getOrCreateComplianceProfile({
    organizationId: active.organization_id,
    brandId,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Compliance profile
        </h1>
        <p className="mt-2 text-muted-foreground">
          Industry presets and editable rules for automated checks.
        </p>
      </div>
      <ComplianceNav current="/compliance/profile" />
      <div className="flex flex-wrap gap-2">
        {(brands ?? []).map((b) => (
          <a
            key={b.id}
            href={`/compliance/profile?brandId=${b.id}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              b.id === brandId ? "bg-foreground text-background" : ""
            }`}
          >
            {b.name}
          </a>
        ))}
      </div>
      <ComplianceProfileForm brandId={brandId} profile={profile} />
    </div>
  );
}
