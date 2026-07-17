import { AdsNav } from "@/components/ads/ads-nav";
import { ComplianceFindingsPanel } from "@/components/compliance/findings-panel";
import { reviewCreative } from "@/lib/ads/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { AdCampaign, AdCreative } from "@/lib/types/ads";
import type { ComplianceCheck } from "@/lib/types/compliance";

export default async function AdsApprovalsPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: creatives } = await supabase
    .from("ad_creatives")
    .select("*")
    .eq("organization_id", active.organization_id)
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false });

  const list = (creatives ?? []) as AdCreative[];
  const campaignIds = [...new Set(list.map((c) => c.campaign_id))];
  const { data: campaigns } = campaignIds.length
    ? await supabase.from("ad_campaigns").select("id, name, platform").in("id", campaignIds)
    : { data: [] };
  const campaignMap = new Map(
    ((campaigns ?? []) as Pick<AdCampaign, "id" | "name" | "platform">[]).map(
      (c) => [c.id, c],
    ),
  );

  const admin = createAdminClient();
  const checkByCreative = new Map<string, ComplianceCheck>();
  if (list.length) {
    const { data: checks } = await admin
      .from("compliance_checks")
      .select("*")
      .eq("organization_id", active.organization_id)
      .eq("entity_type", "ad")
      .in(
        "entity_id",
        list.map((c) => c.id),
      )
      .order("checked_at", { ascending: false });
    for (const c of (checks ?? []) as ComplianceCheck[]) {
      if (!checkByCreative.has(c.entity_id)) {
        checkByCreative.set(c.entity_id, c);
      }
    }
  }

  const canOverride =
    active.role === "org_owner" || active.role === "org_admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Creative approvals</h1>
        <p className="mt-2 text-muted-foreground">
          AI-generated ad copy enters this queue. Approve before any platform upload.
        </p>
      </div>
      <AdsNav current="/ads/approvals" />
      <ul className="space-y-4">
        {list.length === 0 ? (
          <li className="rounded-xl border p-4 text-sm text-muted-foreground">
            Queue is empty.
          </li>
        ) : (
          list.map((cr) => {
            const campaign = campaignMap.get(cr.campaign_id);
            const check = checkByCreative.get(cr.id) ?? null;
            const blocked = check?.status === "fail" && !check.override_by;
            return (
              <li key={cr.id} className="space-y-3 rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">
                  {campaign?.name ?? cr.campaign_id} · {campaign?.platform} ·{" "}
                  {cr.variant_label}
                </p>
                <p className="font-medium">{cr.headline}</p>
                <p className="text-sm">{cr.primary_text}</p>
                {cr.description ? (
                  <p className="text-sm text-muted-foreground">{cr.description}</p>
                ) : null}
                {cr.hook ? <p className="text-sm">Hook: {cr.hook}</p> : null}
                <p className="text-xs text-muted-foreground">CTA: {cr.cta}</p>
                <ComplianceFindingsPanel check={check} />
                <div className="flex flex-wrap gap-2">
                  <form action={reviewCreative} className="space-y-2">
                    <input type="hidden" name="creativeId" value={cr.id} />
                    <input type="hidden" name="decision" value="approve" />
                    {blocked && canOverride ? (
                      <Input
                        name="overrideReason"
                        placeholder="Admin override reason"
                        className="w-64"
                        required
                      />
                    ) : null}
                    <Button
                      type="submit"
                      size="sm"
                      disabled={Boolean(blocked && !canOverride)}
                    >
                      {blocked && !canOverride
                        ? "Blocked — needs admin"
                        : "Approve"}
                    </Button>
                  </form>
                  <form action={reviewCreative} className="flex gap-2">
                    <input type="hidden" name="creativeId" value={cr.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <Input name="reason" placeholder="Reject reason" className="w-48" />
                    <Button type="submit" size="sm" variant="outline">
                      Reject
                    </Button>
                  </form>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
