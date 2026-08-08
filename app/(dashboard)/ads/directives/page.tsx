/* eslint-disable @typescript-eslint/no-explicit-any */
import { AdsNav } from "@/components/ads/ads-nav";
import { DirectiveCreateForm } from "@/components/ads/directive-create-form";
import { RunPipelineButton } from "@/components/ads/run-pipeline-button";
import { setAdDirectiveStatus } from "@/lib/ads/directives-actions";
import { Button } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";

/** Pipeline AI can take 1–3 minutes; keep the server action alive on Vercel. */
export const maxDuration = 300;

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

  const today = new Date().toISOString().slice(0, 10);
  const directives = (directiveRows ?? []) as Array<{
    id: string;
    scope: string;
    title: string;
    focus_text: string;
    status: string;
    starts_on: string | null;
    ends_on: string | null;
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
            {directives.map((d) => {
              const notStarted =
                d.starts_on != null && d.starts_on > today;
              const ended = d.ends_on != null && d.ends_on < today;
              return (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div>
                    <p className="font-medium">
                      [{d.scope}] {d.title}{" "}
                      <span className="text-xs text-muted-foreground">
                        · {d.status}
                        {notStarted ? ` · starts ${d.starts_on}` : ""}
                        {ended ? ` · ended ${d.ends_on}` : ""}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">{d.focus_text}</p>
                    {notStarted && d.status === "active" ? (
                      <p className="mt-1 text-xs text-ink-soft">
                        Timeframe starts {d.starts_on}. Run pipeline still binds
                        this directive; leave Starts empty for immediate
                        auto-selection.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    {canManage && brandId && d.status === "active" ? (
                      <RunPipelineButton
                        brandId={brandId}
                        directiveId={d.id}
                        dailyBudgetPence={200}
                      />
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
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
