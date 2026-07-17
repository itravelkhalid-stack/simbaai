"use client";

import { useActionState } from "react";

import {
  addManualExpense,
  addManualRevenue,
  runFinanceIngestionNow,
  upsertBudget,
  type FinanceActionResult,
} from "@/lib/finance/actions";
import {
  FINANCE_CHANNEL_LABELS,
  FINANCE_CHANNELS,
} from "@/lib/types/finance";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: FinanceActionResult = {};

function monthDefaults() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    today: now.toISOString().slice(0, 10),
  };
}

export function FinanceEntryForms({
  brands,
}: {
  brands: Array<{ id: string; name: string }>;
}) {
  const dates = monthDefaults();
  const [budgetState, budgetAction, budgetPending] = useActionState(
    upsertBudget,
    initial,
  );
  const [expenseState, expenseAction, expensePending] = useActionState(
    addManualExpense,
    initial,
  );
  const [revenueState, revenueAction, revenuePending] = useActionState(
    addManualRevenue,
    initial,
  );
  const [ingestState, ingestAction, ingestPending] = useActionState(
    runFinanceIngestionNow,
    initial,
  );

  const BrandSelect = () => (
    <select
      name="brandId"
      className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
      defaultValue={brands[0]?.id ?? ""}
      required
    >
      {brands.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      <form action={ingestAction} className="rounded-xl border p-4">
        <p className="mb-2 text-sm font-medium">Auto-ingest</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Pull ad spend, AI platform costs, and CRM/store revenue into the ledger.
        </p>
        {ingestState.error || ingestState.success ? (
          <Alert
            className="mb-3"
            variant={ingestState.error ? "destructive" : "default"}
          >
            <AlertDescription>
              {ingestState.error || ingestState.success}
            </AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" variant="outline" disabled={ingestPending}>
          {ingestPending ? "Running…" : "Run ingestion now"}
        </Button>
      </form>

      <div className="grid gap-4 lg:grid-cols-3">
        <form action={budgetAction} className="space-y-2 rounded-xl border p-4">
          <p className="text-sm font-medium">Set channel budget</p>
          <Label>Brand</Label>
          <BrandSelect />
          <Label>Channel</Label>
          <select
            name="channel"
            className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            defaultValue="meta"
          >
            {FINANCE_CHANNELS.filter((c) => c !== "platform").map((c) => (
              <option key={c} value={c}>
                {FINANCE_CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
          <Label>Period start</Label>
          <Input name="periodStart" type="date" defaultValue={dates.start} required />
          <Label>Period end</Label>
          <Input name="periodEnd" type="date" defaultValue={dates.end} required />
          <Label>Planned (£)</Label>
          <Input name="planned" type="number" step="0.01" defaultValue={0} />
          {budgetState.error || budgetState.success ? (
            <Alert variant={budgetState.error ? "destructive" : "default"}>
              <AlertDescription>
                {budgetState.error || budgetState.success}
              </AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={budgetPending || !brands.length}>
            {budgetPending ? "Saving…" : "Save budget"}
          </Button>
        </form>

        <form action={expenseAction} className="space-y-2 rounded-xl border p-4">
          <p className="text-sm font-medium">Manual expense</p>
          <Label>Brand</Label>
          <BrandSelect />
          <Label>Channel</Label>
          <select
            name="channel"
            className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            defaultValue="other"
          >
            {FINANCE_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {FINANCE_CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
          <Label>Date</Label>
          <Input name="expenseDate" type="date" defaultValue={dates.today} required />
          <Label>Description</Label>
          <Input name="description" required />
          <Label>Amount (£)</Label>
          <Input name="amount" type="number" step="0.01" defaultValue={0} />
          {expenseState.error || expenseState.success ? (
            <Alert variant={expenseState.error ? "destructive" : "default"}>
              <AlertDescription>
                {expenseState.error || expenseState.success}
              </AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={expensePending || !brands.length}>
            {expensePending ? "Saving…" : "Add expense"}
          </Button>
        </form>

        <form action={revenueAction} className="space-y-2 rounded-xl border p-4">
          <p className="text-sm font-medium">Manual revenue</p>
          <Label>Brand</Label>
          <BrandSelect />
          <Label>Date</Label>
          <Input name="revenueDate" type="date" defaultValue={dates.today} required />
          <Label>Amount (£)</Label>
          <Input name="amount" type="number" step="0.01" defaultValue={0} />
          <Label>Orders count</Label>
          <Input name="orders" type="number" defaultValue={0} />
          <Label>Notes</Label>
          <Input name="notes" />
          {revenueState.error || revenueState.success ? (
            <Alert variant={revenueState.error ? "destructive" : "default"}>
              <AlertDescription>
                {revenueState.error || revenueState.success}
              </AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={revenuePending || !brands.length}>
            {revenuePending ? "Saving…" : "Add revenue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
