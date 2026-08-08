"use client";

import { useActionState, useMemo, useState } from "react";

import {
  deleteBrandBudgetMonth,
  saveBrandBudgetDefaults,
  upsertBrandBudgetMonth,
  type BudgetActionResult,
} from "@/lib/ads/budget-actions";
import {
  AD_BUDGET_ALLOCATION_MODES,
  type AdBudgetAllocationMode,
  type PlatformAllocationRow,
} from "@/lib/ads/budget-allocation";
import type { BrandBudgetOverview } from "@/lib/ads/budget-overview";
import { formatPence } from "@/lib/ads/format";
import { AD_PLATFORM_LABELS, type AdPlatform } from "@/lib/types/ads";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PLATFORMS: AdPlatform[] = ["meta", "google"];

const initial: BudgetActionResult = {};

function AllocEditor({
  mode,
  rows,
  onChange,
}: {
  mode: AdBudgetAllocationMode;
  rows: PlatformAllocationRow[];
  onChange: (rows: PlatformAllocationRow[]) => void;
}) {
  const byPlatform = useMemo(() => {
    const m = new Map(rows.map((r) => [r.platform, r]));
    return m;
  }, [rows]);

  function update(platform: AdPlatform, patch: Partial<PlatformAllocationRow>) {
    const next: PlatformAllocationRow[] = PLATFORMS.map((p) => {
      const existing: PlatformAllocationRow = byPlatform.get(p) ?? {
        platform: p,
      };
      if (p !== platform) return existing;
      return { ...existing, platform: p, ...patch };
    }).filter((r) => {
      if (mode === "ai_allocates") {
        return r.locked || r.pct != null || r.amount_pence != null;
      }
      return r.pct != null || r.amount_pence != null;
    });
    // Keep empty placeholders for editing UX when manual
    if (mode !== "ai_allocates") {
      const out: PlatformAllocationRow[] = PLATFORMS.map((p) => {
        const found = next.find((r) => r.platform === p);
        return (
          found ?? {
            platform: p,
            pct: mode === "manual_pct" ? 0 : null,
            amount_pence: mode === "manual_amount" ? 0 : null,
          }
        );
      });
      onChange(out);
      return;
    }
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {PLATFORMS.map((platform) => {
        const row = byPlatform.get(platform) ?? { platform };
        return (
          <div
            key={platform}
            className="grid gap-3 rounded-[8px] border border-[var(--sem-border)] p-3 sm:grid-cols-3"
          >
            <div className="text-sm font-medium text-[var(--sem-ink)]">
              {AD_PLATFORM_LABELS[platform]}
            </div>
            {mode === "manual_amount" ? (
              <div className="space-y-1">
                <Label>Amount (£)</Label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={
                    row.amount_pence != null
                      ? (row.amount_pence / 100).toFixed(0)
                      : ""
                  }
                  onChange={(e) =>
                    update(platform, {
                      amount_pence:
                        e.target.value === ""
                          ? null
                          : Math.round(Number(e.target.value) * 100),
                      pct: null,
                    })
                  }
                />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>{mode === "ai_allocates" ? "Pin %" : "Percent"}</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  value={row.pct ?? ""}
                  onChange={(e) =>
                    update(platform, {
                      pct:
                        e.target.value === "" ? null : Number(e.target.value),
                      amount_pence: null,
                    })
                  }
                />
              </div>
            )}
            {mode === "ai_allocates" ? (
              <label className="flex items-center gap-2 text-sm text-[var(--sem-ink-soft)]">
                <input
                  type="checkbox"
                  checked={Boolean(row.locked || row.pct != null)}
                  onChange={(e) =>
                    update(platform, {
                      locked: e.target.checked,
                      pct: e.target.checked ? (row.pct ?? 0) : null,
                    })
                  }
                />
                Hard constraint
              </label>
            ) : (
              <p className="self-end text-xs text-[var(--sem-ink-soft)]">
                Hard split — Simba cannot override
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BudgetPotPanel({
  overview,
  canWrite,
}: {
  overview: BrandBudgetOverview;
  canWrite: boolean;
}) {
  const [mode, setMode] = useState<AdBudgetAllocationMode>(
    overview.allocationMode,
  );
  const [allocRows, setAllocRows] = useState<PlatformAllocationRow[]>(
    overview.platformAllocations.length
      ? overview.platformAllocations
      : [
          { platform: "meta", pct: mode === "manual_pct" ? 60 : null },
          { platform: "google", pct: mode === "manual_pct" ? 40 : null },
        ],
  );
  const [yearMonth, setYearMonth] = useState(overview.yearMonth);
  const [monthState, monthAction, monthPending] = useActionState(
    upsertBrandBudgetMonth,
    initial,
  );
  const [defaultState, defaultAction, defaultPending] = useActionState(
    saveBrandBudgetDefaults,
    initial,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteBrandBudgetMonth,
    initial,
  );

  const allocJson = JSON.stringify(allocRows);

  return (
    <div className="space-y-6">
      {overview.pacingWouldExceed ? (
        <Alert variant="destructive">
          <AlertDescription>
            Combined pacing warning: committed daily £
            {(overview.committedDailyPence / 100).toFixed(2)} or projected
            month-end £{(overview.projectedMonthEndPence / 100).toFixed(2)}{" "}
            would exceed the shared pot
            {overview.potPence != null
              ? ` of ${formatPence(overview.potPence, overview.currency)}`
              : ""}
            . Reduce platform budgets or raise the month pot.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Monthly pot"
          value={
            overview.potPence != null
              ? formatPence(overview.potPence, overview.currency)
              : "Not set"
          }
          hint={
            overview.source === "schedule"
              ? "From schedule"
              : overview.source === "default"
                ? "Default fallback"
                : "Idle — no pot"
          }
        />
        <Metric
          label="Spend to date"
          value={formatPence(overview.spendToDatePence, overview.currency)}
          hint={overview.yearMonthLabel}
        />
        <Metric
          label="Projected month-end"
          value={formatPence(overview.projectedMonthEndPence, overview.currency)}
          hint="Linear from MTD spend"
        />
        <Metric
          label="Committed daily"
          value={formatPence(overview.committedDailyPence, overview.currency)}
          hint={
            overview.combinedDailyCeilingPence != null
              ? `Ceiling ${formatPence(overview.combinedDailyCeilingPence, overview.currency)}`
              : "All platforms combined"
          }
        />
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-[var(--sem-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--sem-border)] text-left text-xs uppercase tracking-wide text-[var(--sem-ink-soft)]">
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Allocation</th>
              <th className="px-4 py-3 font-medium">Spend to date</th>
              <th className="px-4 py-3 font-medium">Committed / day</th>
            </tr>
          </thead>
          <tbody>
            {overview.platforms.map((row) => (
              <tr
                key={row.platform}
                className="border-b border-[var(--sem-border)] last:border-0"
              >
                <td className="px-4 py-3 font-medium">
                  {AD_PLATFORM_LABELS[row.platform]}
                  {row.locked ? (
                    <span className="ml-2 text-xs text-[var(--sem-ink-soft)]">
                      locked
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {formatPence(row.allocated_monthly_pence, overview.currency)}{" "}
                  <span className="text-[var(--sem-ink-soft)]">
                    ({row.allocated_pct.toFixed(0)}%)
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {formatPence(row.spend_to_date_pence, overview.currency)}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {formatPence(row.committed_daily_pence, overview.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canWrite ? (
        <>
          <form
            action={monthAction}
            className="space-y-4 rounded-[12px] border border-[var(--sem-border)] bg-[var(--sem-surface)] p-4"
          >
            <div>
              <h2 className="font-heading text-lg font-semibold text-[var(--sem-ink)]">
                Month schedule entry
              </h2>
              <p className="text-sm text-[var(--sem-ink-soft)]">
                One shared pot for Meta, Google, and future platforms. Optional
                split is enforced as a hard constraint when manual.
              </p>
            </div>
            {(monthState.error || monthState.success) && (
              <Alert variant={monthState.error ? "destructive" : "default"}>
                <AlertDescription>
                  {monthState.error ?? monthState.success}
                </AlertDescription>
              </Alert>
            )}
            <input type="hidden" name="brandId" value={overview.brandId} />
            <input type="hidden" name="currency" value={overview.currency} />
            <input type="hidden" name="platformAllocationsJson" value={allocJson} />
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="yearMonth">Month</Label>
                <Input
                  id="yearMonth"
                  name="yearMonth"
                  type="month"
                  value={yearMonth}
                  onChange={(e) => setYearMonth(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budgetMajor">Monthly pot (£)</Label>
                <Input
                  id="budgetMajor"
                  name="budgetMajor"
                  type="number"
                  min={0}
                  step="1"
                  required
                  defaultValue={
                    overview.potPence != null
                      ? (overview.potPence / 100).toFixed(0)
                      : "500"
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="allocationMode">Allocation mode</Label>
                <select
                  id="allocationMode"
                  name="allocationMode"
                  className="flex h-10 w-full rounded-[8px] border border-[var(--sem-border)] bg-[var(--sem-surface)] px-3 text-sm"
                  value={mode}
                  onChange={(e) =>
                    setMode(e.target.value as AdBudgetAllocationMode)
                  }
                >
                  {AD_BUDGET_ALLOCATION_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m === "manual_pct"
                        ? "Manual % split"
                        : m === "manual_amount"
                          ? "Manual £ amounts"
                          : "AI allocates"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <AllocEditor mode={mode} rows={allocRows} onChange={setAllocRows} />
            <Button type="submit" disabled={monthPending}>
              {monthPending ? "Saving…" : "Save month pot"}
            </Button>
          </form>

          <form
            action={defaultAction}
            className="space-y-4 rounded-[12px] border border-[var(--sem-border)] p-4"
          >
            <div>
              <h2 className="font-heading text-lg font-semibold">
                Default monthly pot
              </h2>
              <p className="text-sm text-[var(--sem-ink-soft)]">
                Used when a month has no schedule entry. Leave blank to idle
                those months.
              </p>
            </div>
            {(defaultState.error || defaultState.success) && (
              <Alert variant={defaultState.error ? "destructive" : "default"}>
                <AlertDescription>
                  {defaultState.error ?? defaultState.success}
                </AlertDescription>
              </Alert>
            )}
            <input type="hidden" name="brandId" value={overview.brandId} />
            <input type="hidden" name="currency" value={overview.currency} />
            <input type="hidden" name="allocationMode" value={mode} />
            <input type="hidden" name="platformAllocationsJson" value={allocJson} />
            <div className="max-w-xs space-y-2">
              <Label htmlFor="defaultBudgetMajor">Default pot (£)</Label>
              <Input
                id="defaultBudgetMajor"
                name="defaultBudgetMajor"
                type="number"
                min={0}
                step="1"
                defaultValue={
                  overview.defaultBudgetPence != null
                    ? (overview.defaultBudgetPence / 100).toFixed(0)
                    : ""
                }
              />
            </div>
            <Button type="submit" variant="outline" disabled={defaultPending}>
              {defaultPending ? "Saving…" : "Save defaults"}
            </Button>
          </form>

          {overview.scheduleRows.length > 0 ? (
            <div className="space-y-3">
              <h2 className="font-heading text-lg font-semibold">
                Scheduled months
              </h2>
              <ul className="space-y-2">
                {overview.scheduleRows.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--sem-border)] px-3 py-2 text-sm"
                  >
                    <span>
                      {row.year_month}:{" "}
                      {formatPence(row.budget_pence, row.currency)} ·{" "}
                      {row.allocation_mode}
                    </span>
                    <form action={deleteAction}>
                      <input
                        type="hidden"
                        name="brandId"
                        value={overview.brandId}
                      />
                      <input
                        type="hidden"
                        name="yearMonth"
                        value={row.year_month}
                      />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        disabled={deletePending}
                      >
                        Remove
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
              {deleteState.error || deleteState.success ? (
                <p className="text-sm text-[var(--sem-ink-soft)]">
                  {deleteState.error ?? deleteState.success}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--sem-border)] bg-[var(--sem-surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--sem-ink-soft)]">
        {label}
      </p>
      <p className="mt-1 font-heading text-2xl font-semibold tabular-nums text-[var(--sem-ink)]">
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--sem-ink-soft)]">{hint}</p>
    </div>
  );
}
