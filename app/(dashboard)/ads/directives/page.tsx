/* eslint-disable @typescript-eslint/no-explicit-any */
import { AdsNav } from "@/components/ads/ads-nav";
import { DirectiveCreateForm } from "@/components/ads/directive-create-form";
import { setAdDirectiveStatus } from "@/lib/ads/directives-actions";
import { runFirstFlightPipelineAction } from "@/lib/ads/pipeline-actions";
import { Button } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";

export default async function AdsDirectivesPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const db = supabase as any;
  const { data: brand } = await supabase
    .from("brands")
    .select("id, name")
    .eq("organization_id", active.organization_id)
    .eq("is_primary", true)
    .maybeSingle();
  const brandId = brand?.id;
  const { data: directiveRows } = brandId
    ? await db
        .from("ad_campaign_directives")
        .select("*")
        .eq("organization_id", active.organization_id)
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] as Array<Record<string, unknown>> };

  const directives = (directiveRows ?? []) as Array<{
    id: string;
    scope: string;
    title: string;
    focus_text: string;
    status: string;
  }>;
  const canManage = active.role !== "org_viewer";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Campaign directives
        </h1>
        <p className="mt-2 text-muted-foreground">
          Human steering for the next media plan. Active directives are binding;
          with none, the strategist selects from seasonality + trends. First
          flight uses £2/day and opens a launch review board — Meta create stays
          paused until CMO + you verify in Ads Manager.
        </p>
      </div>
      <AdsNav current="/ads/directives" />
      {brandId && brand ? (
        <DirectiveCreateForm brandId={brandId} brandName={brand.name} />
      ) : (
        <p className="text-sm text-muted-foreground">No primary brand.</p>
      )}
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Recent</h2>
        {(directives ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No directives yet.</p>
        ) : (
          <ul className="space-y-2">
            {directives.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div>
                  <p className="font-medium">
                    [{d.scope}] {d.title}{" "}
                    <span className="text-xs text-muted-foreground">
                      · {d.status}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">{d.focus_text}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canManage && brandId && d.status === "active" ? (
                    <form action={runFirstFlightPipelineAction}>
                      <input type="hidden" name="brandId" value={brandId} />
                      <input type="hidden" name="directiveId" value={d.id} />
                      <input type="hidden" name="dailyBudgetPence" value="200" />
                      <Button type="submit" size="sm">
                        Run pipeline (£2/day)
                      </Button>
                    </form>
                  ) : null}
                  {d.status === "active" ? (
                    <form action={setAdDirectiveStatus}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="status" value="paused" />
                      <Button type="submit" size="sm" variant="outline">
                        Pause
                      </Button>
                    </form>
                  ) : (
                    <form action={setAdDirectiveStatus}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="status" value="active" />
                      <Button type="submit" size="sm" variant="outline">
                        Activate
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
