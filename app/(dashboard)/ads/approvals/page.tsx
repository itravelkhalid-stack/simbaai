import Link from "next/link";

import { AdsNav } from "@/components/ads/ads-nav";
import { ComplianceFindingsPanel } from "@/components/compliance/findings-panel";
import { reviewCreative } from "@/lib/ads/actions";
import {
  attachMediaAssetToAdCreative,
  setCampaignLive,
} from "@/lib/ads/launch-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { AdCampaign, AdCreative } from "@/lib/types/ads";
import type { ComplianceCheck } from "@/lib/types/compliance";
import type { MediaAsset } from "@/lib/types/media";

export default async function AdsApprovalsPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: creatives } = await supabase
    .from("ad_creatives")
    .select("*")
    .eq("organization_id", active.organization_id)
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false });
  const { data: launchRows } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("organization_id", active.organization_id)
    .eq("status", "pending_approval")
    .not("platform_campaign_id", "is", null)
    .order("remote_created_at", { ascending: false });
  const launchCampaigns = (launchRows ?? []) as AdCampaign[];

  const list = (creatives ?? []) as AdCreative[];
  const brandIds = [...new Set(list.map((creative) => creative.brand_id))];
  const { data: mediaRows } = brandIds.length
    ? await supabase
        .from("media_assets")
        .select("*")
        .eq("organization_id", active.organization_id)
        .in("brand_id", brandIds)
        .in("type", ["image", "logo"])
        .order("created_at", { ascending: false })
    : { data: [] };
  const mediaByBrand = new Map<string, MediaAsset[]>();
  for (const asset of (mediaRows ?? []) as MediaAsset[]) {
    mediaByBrand.set(asset.brand_id, [
      ...(mediaByBrand.get(asset.brand_id) ?? []),
      asset,
    ]);
  }
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
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">Campaign launch approvals</h2>
          <p className="text-sm text-muted-foreground">
            These hierarchies already exist PAUSED on the platform. Review IDs
            and budget before explicitly setting live.
          </p>
        </div>
        {launchCampaigns.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">
            No campaigns awaiting launch.
          </p>
        ) : (
          <ul className="space-y-3">
            {launchCampaigns.map((campaign) => (
              <li key={campaign.id} className="space-y-2 rounded-xl border p-4">
                <p className="font-medium">
                  {campaign.name} · {campaign.platform}
                </p>
                <p className="text-sm">
                  {campaign.currency}{" "}
                  {((campaign.daily_budget_pence ?? 0) / 100).toFixed(2)}/day
                </p>
                <div className="grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
                  <p>Campaign: {campaign.platform_campaign_id}</p>
                  <p>
                    {campaign.platform === "meta" ? "Ad set" : "Ad group"}:{" "}
                    {campaign.platform_adset_id ?? "—"}
                  </p>
                  <p>Ad: {campaign.platform_ad_id ?? "—"}</p>
                  <p>Budget: {campaign.platform_budget_id ?? "—"}</p>
                </div>
                <form action={setCampaignLive}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <Button type="submit">Approve & set live</Button>
                </form>
                <Link
                  href={`/ads/campaigns/${campaign.id}`}
                  className="text-sm underline"
                >
                  Review campaign and open platform link
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">Creative approvals</h2>
          <p className="text-sm text-muted-foreground">
            AI-generated copy must be approved before platform creation.
          </p>
        </div>
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
                {cr.media_urls?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {cr.media_urls.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={url}
                        src={url}
                        alt=""
                        className="h-20 w-28 rounded border object-cover"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-destructive">
                    No image attached. Meta platform creation will be blocked.
                  </p>
                )}
                {(mediaByBrand.get(cr.brand_id) ?? []).length ? (
                  <form action={attachMediaAssetToAdCreative} className="flex gap-2">
                    <input type="hidden" name="creativeId" value={cr.id} />
                    <select
                      name="assetId"
                      required
                      className="h-9 min-w-56 rounded-lg border bg-background px-2 text-sm"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Attach brand image…
                      </option>
                      {(mediaByBrand.get(cr.brand_id) ?? []).map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.filename}
                          {asset.tags.length ? ` · ${asset.tags.join(", ")}` : ""}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" size="sm" variant="outline">
                      Attach
                    </Button>
                  </form>
                ) : null}
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
      </section>
    </div>
  );
}
