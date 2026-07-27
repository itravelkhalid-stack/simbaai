import { AdsNav } from "@/components/ads/ads-nav";
import { ConnectionsPanel } from "@/components/ads/connections-panel";
import { PageHeader } from "@/components/dashboard/page-header";
import { consumeAdsOAuthFlashError } from "@/lib/ads/oauth-flash";
import { AD_PLATFORMS, getAdsProvider } from "@/lib/ads/providers";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { AdConnection, AdPlatform } from "@/lib/types/ads";

export default async function AdsConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const q = await searchParams;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from("ad_connections")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("created_at", { ascending: false });

  const oauthEnabled = AD_PLATFORMS.filter(
    (p) => getAdsProvider(p).supportsOAuth,
  ) as AdPlatform[];

  const flashError = await consumeAdsOAuthFlashError(q.error);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ad connections"
        description="Connect Meta, TikTok, Google, X, and Microsoft Advertising accounts. Tokens are encrypted at rest."
      />
      <AdsNav current="/ads/connections" />
      {flashError ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {flashError}
        </p>
      ) : null}
      {q.connected ? (
        <p className="rounded-md bg-success-soft px-3 py-2 text-sm text-ink">
          Connected {q.connected}.
        </p>
      ) : null}
      <p className="text-sm text-ink-soft">
        Setup requirements for each network are documented in{" "}
        <code className="text-xs">docs/ads-apis.md</code>.
      </p>
      <ConnectionsPanel
        connections={(data ?? []) as AdConnection[]}
        oauthEnabled={oauthEnabled}
      />
    </div>
  );
}
