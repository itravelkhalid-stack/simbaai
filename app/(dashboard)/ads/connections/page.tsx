import { AdsNav } from "@/components/ads/ads-nav";
import { ConnectionsPanel } from "@/components/ads/connections-panel";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { AdConnection } from "@/lib/types/ads";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Ad connections</h1>
        <p className="mt-2 text-muted-foreground">
          Connect Meta, TikTok, Google, X, and Microsoft Advertising accounts.
          Tokens are encrypted at rest.
        </p>
      </div>
      <AdsNav current="/ads/connections" />
      {q.error ? (
        <p className="text-sm text-destructive">{q.error}</p>
      ) : null}
      {q.connected ? (
        <p className="text-sm text-muted-foreground">Connected {q.connected}.</p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Setup requirements for each network are documented in{" "}
        <code className="text-xs">docs/ads-apis.md</code>.
      </p>
      <ConnectionsPanel connections={(data ?? []) as AdConnection[]} />
    </div>
  );
}
