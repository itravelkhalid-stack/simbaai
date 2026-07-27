import Link from "next/link";

import { AdsNav } from "@/components/ads/ads-nav";
import {
  ApprovalCardShell,
  PlatformChip,
  SeverityCallout,
  SimbaBadge,
} from "@/components/approvals/approval-card";
import { EmptyState } from "@/components/brand/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reviewCreative } from "@/lib/ads/actions";
import {
  attachMediaAssetToAdCreative,
  setCampaignLive,
} from "@/lib/ads/launch-actions";
import { requireActiveOrg } from "@/lib/org/require";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AdCampaign, AdCreative } from "@/lib/types/ads";
import type { ComplianceCheck } from "@/lib/types/compliance";
import type { MediaAsset } from "@/lib/types/media";
import { cn } from "@/lib/utils";

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
    ? await supabase
        .from("ad_campaigns")
        .select("id, name, platform")
        .in("id", campaignIds)
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
      <PageHeader
        title="Creative approvals"
        description="AI-generated ad copy enters this queue. Approve before any platform upload."
      />
      <AdsNav current="/ads/approvals" />

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-ink">
            Campaign launch approvals
          </h2>
          <p className="text-sm text-ink-soft">
            These hierarchies already exist PAUSED on the platform. Review IDs
            and budget before explicitly setting live.
          </p>
        </div>
        {launchCampaigns.length === 0 ? (
          <p className="rounded-lg bg-muted px-4 py-6 text-sm text-ink-soft">
            No campaigns awaiting launch.
          </p>
        ) : (
          <ul className="space-y-3">
            {launchCampaigns.map((campaign) => (
              <li key={campaign.id}>
                <ApprovalCardShell>
                  <div className="flex flex-wrap items-center gap-2">
                    <PlatformChip
                      platform={campaign.platform}
                      label={campaign.platform}
                    />
                    <Badge variant="warning">Pending launch</Badge>
                  </div>
                  <p className="mt-3 font-heading text-lg font-semibold text-ink">
                    {campaign.name}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {campaign.currency}{" "}
                    {((campaign.daily_budget_pence ?? 0) / 100).toFixed(2)}
                    /day
                  </p>
                  <div className="mt-3 grid gap-1 text-xs text-ink-soft md:grid-cols-2">
                    <p>Campaign: {campaign.platform_campaign_id}</p>
                    <p>
                      {campaign.platform === "meta" ? "Ad set" : "Ad group"}:{" "}
                      {campaign.platform_adset_id ?? "—"}
                    </p>
                    <p>Ad: {campaign.platform_ad_id ?? "—"}</p>
                    <p>Budget: {campaign.platform_budget_id ?? "—"}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    <form action={setCampaignLive}>
                      <input
                        type="hidden"
                        name="campaignId"
                        value={campaign.id}
                      />
                      <Button type="submit">Approve & set live</Button>
                    </form>
                    <Link
                      href={`/ads/campaigns/${campaign.id}`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                      )}
                    >
                      Review campaign
                    </Link>
                  </div>
                </ApprovalCardShell>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold text-ink">
            Creative approvals
          </h2>
          <p className="text-sm text-ink-soft">
            AI-generated copy must be approved before platform creation.
          </p>
        </div>
        {list.length === 0 ? (
          <EmptyState
            title="Queue is empty"
            description="Generated ad creatives will appear here for review."
            actionLabel="Open ads"
            actionHref="/ads"
          />
        ) : (
          <ul className="space-y-4">
            {list.map((cr) => {
              const campaign = campaignMap.get(cr.campaign_id);
              const check = checkByCreative.get(cr.id) ?? null;
              const blocked = check?.status === "fail" && !check.override_by;
              const thumb = cr.media_urls?.[0];
              const findings = check?.findings ?? [];
              return (
                <li key={cr.id}>
                  <ApprovalCardShell>
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="size-24 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center px-2 text-center text-xs text-danger">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {campaign?.platform ? (
                            <PlatformChip
                              platform={campaign.platform}
                              label={campaign.platform}
                            />
                          ) : null}
                          <Badge variant="neutral">
                            {cr.variant_label || "Variant"}
                          </Badge>
                          <Badge variant="warning">Pending approval</Badge>
                          <SimbaBadge />
                        </div>
                        <div>
                          <p className="text-xs text-ink-soft">
                            {campaign?.name ?? cr.campaign_id}
                          </p>
                          <p className="font-heading text-lg font-semibold text-ink">
                            {cr.headline}
                          </p>
                          <p className="mt-1 text-sm text-ink-soft">
                            {cr.primary_text}
                          </p>
                          {cr.description ? (
                            <p className="mt-1 text-sm text-ink-soft">
                              {cr.description}
                            </p>
                          ) : null}
                          {cr.hook ? (
                            <p className="mt-1 text-sm">Hook: {cr.hook}</p>
                          ) : null}
                          <p className="mt-1 text-xs text-ink-soft">
                            CTA: {cr.cta}
                          </p>
                        </div>
                        {findings.length > 0 ? (
                          <div className="space-y-2">
                            {findings.map((f, i) => (
                              <SeverityCallout
                                key={`${f.code}-${i}`}
                                severity={f.severity}
                                title={f.code}
                                message={f.message}
                              />
                            ))}
                          </div>
                        ) : check ? (
                          <p className="text-xs font-medium text-primary">
                            Compliance · {check.status.toUpperCase()}
                          </p>
                        ) : (
                          <p className="text-xs text-ink-soft">
                            No compliance check recorded yet.
                          </p>
                        )}
                        {(mediaByBrand.get(cr.brand_id) ?? []).length ? (
                          <form
                            action={attachMediaAssetToAdCreative}
                            className="flex flex-wrap gap-2"
                          >
                            <input
                              type="hidden"
                              name="creativeId"
                              value={cr.id}
                            />
                            <select
                              name="assetId"
                              required
                              className="h-9 min-w-56 rounded-md border border-border bg-surface px-2 text-sm"
                              defaultValue=""
                            >
                              <option value="" disabled>
                                Attach brand image…
                              </option>
                              {(mediaByBrand.get(cr.brand_id) ?? []).map(
                                (asset) => (
                                  <option key={asset.id} value={asset.id}>
                                    {asset.filename}
                                    {asset.tags.length
                                      ? ` · ${asset.tags.join(", ")}`
                                      : ""}
                                  </option>
                                ),
                              )}
                            </select>
                            <Button type="submit" size="sm" variant="outline">
                              Attach
                            </Button>
                          </form>
                        ) : null}
                        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
                          <form action={reviewCreative} className="space-y-2">
                            <input
                              type="hidden"
                              name="creativeId"
                              value={cr.id}
                            />
                            <input
                              type="hidden"
                              name="decision"
                              value="approve"
                            />
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
                              disabled={Boolean(blocked && !canOverride)}
                            >
                              {blocked && !canOverride
                                ? "Blocked — needs admin"
                                : "Approve"}
                            </Button>
                          </form>
                          <form
                            action={reviewCreative}
                            className="flex flex-wrap gap-2"
                          >
                            <input
                              type="hidden"
                              name="creativeId"
                              value={cr.id}
                            />
                            <input
                              type="hidden"
                              name="decision"
                              value="reject"
                            />
                            <Input
                              name="reason"
                              placeholder="Reject reason"
                              className="w-48"
                            />
                            <Button type="submit" variant="destructive">
                              Reject
                            </Button>
                          </form>
                        </div>
                      </div>
                    </div>
                  </ApprovalCardShell>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
