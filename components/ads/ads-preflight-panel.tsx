import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { adsWritesEnabled } from "@/lib/ads/providers/types";
import type { AdConnection, OrgAdLimits } from "@/lib/types/ads";

export function recommendedLimitsForMonthlyBudget(monthlyGbp: number) {
  const orgDaily = Math.round((monthlyGbp / 30) * 1.2 * 100) / 100;
  return {
    monthlyGbp,
    orgDailyGbp: orgDaily,
    perCampaignDailyGbp: orgDaily,
    orgDailyPence: Math.round(orgDaily * 100),
    perCampaignDailyPence: Math.round(orgDaily * 100),
    formula: "org daily = monthly/30 × 1.2 headroom; per-campaign = org daily",
  };
}

function looksLikeMetaAdAccountId(accountId: string) {
  const digits = accountId.replace(/^act_/, "");
  return /^\d{5,}$/.test(digits);
}

export function AdsPreflightPanel({
  limits,
  metaConnection,
  monthlyBudgetPence,
}: {
  limits: OrgAdLimits | null;
  metaConnection: AdConnection | null;
  monthlyBudgetPence: number | null;
}) {
  const monthlyGbp = (monthlyBudgetPence ?? 50000) / 100;
  const recommended = recommendedLimitsForMonthlyBudget(monthlyGbp);
  const metaOk =
    metaConnection &&
    metaConnection.status === "active" &&
    looksLikeMetaAdAccountId(metaConnection.account_id);
  const writesLocal = adsWritesEnabled("meta");

  return (
    <div className="space-y-3">
      <Alert variant={metaOk ? "default" : "destructive"}>
        <AlertTitle>Pre-flight — Meta Ads</AlertTitle>
        <AlertDescription className="space-y-2 text-sm">
          <p>
            <strong>Built vs proven:</strong> Meta campaign create via Graph is
            implemented (PAUSED hierarchy) but this org has{" "}
            <strong>zero</strong> production platform campaign IDs — unproven
            until the first paused campaign appears in Ads Manager.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Local/runtime <code>ADS_WRITES_ENABLED</code> /{" "}
              <code>ADS_WRITES_META</code>:{" "}
              {writesLocal ? "ON (local process)" : "OFF / unset in this process"}{" "}
              — confirm the same are <code>true</code> in{" "}
              <strong>Vercel Production</strong> and redeploy after changes.
            </li>
            <li>
              Org limits:{" "}
              {limits
                ? `£${(limits.max_daily_spend_pence / 100).toFixed(2)}/day org · £${(limits.max_single_campaign_daily_budget_pence / 100).toFixed(2)}/day campaign · master pause ${limits.writes_paused ? "ON (blocks writes)" : "off"}`
                : "MISSING — writes fail-closed"}
            </li>
            <li>
              Meta ad connection:{" "}
              {metaConnection
                ? `${metaConnection.account_name} · ${metaConnection.account_id} · ${metaOk ? "looks like act_ id" : "INVALID — reconnect; account id must be act_… / digits, not an email"}`
                : "NONE — connect on /ads/connections"}
            </li>
          </ul>
          <p>
            For £{monthlyGbp.toFixed(0)}/mo suggested limits:{" "}
            <strong>£{recommended.orgDailyGbp.toFixed(2)}/day org</strong> and{" "}
            <strong>£{recommended.perCampaignDailyGbp.toFixed(2)}/day per campaign</strong>{" "}
            ({recommended.formula}). Keep current £5 / £2 until first flight at
            £2/day is verified in Ads Manager, then raise and uncheck master
            pause.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
