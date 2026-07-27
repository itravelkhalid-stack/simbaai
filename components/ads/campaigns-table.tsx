import Link from "next/link";

import { SpendPacingBar } from "@/components/ads/metrics-widgets";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPence } from "@/lib/ads/format";
import { aggregateMetrics } from "@/lib/ads/metrics";
import type { AdCampaign, AdMetricDaily } from "@/lib/types/ads";
import { AD_PLATFORM_LABELS } from "@/lib/types/ads";
import { statusTone } from "@/lib/ui/status";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending",
  approved: "Approved",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
  error: "Error",
};

export function CampaignsTable({
  campaigns,
  metrics,
  days,
}: {
  campaigns: AdCampaign[];
  metrics: AdMetricDaily[];
  days: number;
}) {
  if (!campaigns.length) {
    return (
      <p className="rounded-lg bg-muted px-4 py-6 text-sm text-ink-soft">
        No campaigns yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-elevated ring-1 ring-border">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-heading text-sm font-semibold text-ink">
          Campaigns
        </h2>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campaign</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Spend</TableHead>
            <TableHead>Pacing</TableHead>
            <TableHead className="text-right">ROAS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {campaigns.slice(0, 20).map((c) => {
            const a = aggregateMetrics(
              metrics.filter((m) => m.campaign_id === c.id),
            );
            return (
              <TableRow key={c.id}>
                <TableCell>
                  <Link
                    href={`/ads/campaigns/${c.id}`}
                    className="font-medium text-ink hover:text-primary"
                  >
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell className="text-ink-soft">
                  {AD_PLATFORM_LABELS[c.platform]}
                </TableCell>
                <TableCell>
                  <Badge variant={statusTone(c.status)}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatPence(a.spend_pence, c.currency)}
                </TableCell>
                <TableCell>
                  <SpendPacingBar
                    spentPence={a.spend_pence}
                    budgetPence={c.daily_budget_pence}
                    days={days}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {a.roas.toFixed(2)}x
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
