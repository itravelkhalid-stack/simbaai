import { saveOrgAdLimits } from "@/lib/ads/launch-actions";
import type { OrgAdLimits } from "@/lib/types/ads";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdLimitsForm({
  limits,
  brandId,
  brandName,
}: {
  limits: OrgAdLimits | null;
  brandId?: string;
  brandName?: string;
}) {
  return (
    <form action={saveOrgAdLimits} className="space-y-4 rounded-xl border p-4">
      {brandId ? <input type="hidden" name="brandId" value={brandId} /> : null}
      <div>
        <h2 className="font-medium">
          {brandName ? `${brandName} limits` : "Organization hard limits"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {brandName
            ? "Optional stricter brand override; effective limits are the lower of organization and brand."
            : "Checked server-side before every platform mutation. Missing limits block all writes. TikTok, X, and Bing remain blocked."}
        </p>
      </div>
      {!limits && !brandId ? (
        <Alert variant="destructive">
          <AlertDescription>
            No limits configured: all remote ad writes are currently blocked.
          </AlertDescription>
        </Alert>
      ) : !limits && brandId ? (
        <Alert>
          <AlertDescription>
            No brand override configured; organization limits currently apply.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="maxDailySpendMajor">
            Maximum active daily spend (£)
          </Label>
          <Input
            id="maxDailySpendMajor"
            name="maxDailySpendMajor"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={(limits?.max_daily_spend_pence ?? 500) / 100}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maxSingleMajor">
            Maximum one-campaign daily budget (£)
          </Label>
          <Input
            id="maxSingleMajor"
            name="maxSingleMajor"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={
              (limits?.max_single_campaign_daily_budget_pence ?? 200) / 100
            }
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="writesPaused"
          defaultChecked={limits?.writes_paused ?? true}
        />
        Master pause: block creates, launches, and budget increases
      </label>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="killMeta"
            defaultChecked={limits?.platform_kill_switches?.meta ?? false}
          />
          Kill switch: Meta
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="killGoogle"
            defaultChecked={limits?.platform_kill_switches?.google ?? false}
          />
          Kill switch: Google
        </label>
      </div>
      <Button type="submit">Save hard limits</Button>
    </form>
  );
}
