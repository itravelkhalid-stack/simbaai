"use client";

import { useActionState, useState, type ReactNode } from "react";

import {
  approvePlanSection,
  finalizePlanApproval,
  savePlanDocument,
  type PlanningActionResult,
} from "@/lib/planning/actions";
import {
  PLAN_SECTIONS,
  type MarketingPlan,
  type PlanDocument,
  type PlanSectionKey,
} from "@/lib/types/planning";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const initial: PlanningActionResult = {};

function formatPence(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

export function PlanDocumentEditor({ plan }: { plan: MarketingPlan }) {
  const [title, setTitle] = useState(plan.title);
  const [json, setJson] = useState(JSON.stringify(plan.document, null, 2));
  const [saveState, saveAction, saving] = useActionState(savePlanDocument, initial);
  const doc = plan.document as PlanDocument;
  const approvals = plan.section_approvals ?? {};
  const allApproved = PLAN_SECTIONS.every((s) => approvals[s.key]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-4">
        <p className="text-sm font-medium">Summary</p>
        <p className="mt-2 text-sm text-muted-foreground">{doc.summary}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {plan.period_start} → {plan.period_end} · Status {plan.status}
          {plan.budget_pence != null ? ` · ${formatPence(plan.budget_pence)}` : ""}
        </p>
      </div>

      <div className="space-y-3">
        {PLAN_SECTIONS.map((section) => (
          <SectionCard
            key={section.key}
            sectionKey={section.key}
            label={section.label}
            approved={Boolean(approvals[section.key])}
            planId={plan.id}
            content={<SectionBody section={section.key} doc={doc} />}
          />
        ))}
      </div>

      <form action={saveAction} className="space-y-3 rounded-xl border p-4">
        <input type="hidden" name="planId" value={plan.id} />
        <Input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Plan title"
        />
        <Textarea
          name="document"
          rows={18}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          className="font-mono text-xs"
        />
        {saveState.error || saveState.success ? (
          <Alert variant={saveState.error ? "destructive" : "default"}>
            <AlertDescription>
              {saveState.error || saveState.success}
            </AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" variant="outline" disabled={saving}>
          {saving ? "Saving…" : "Save edits"}
        </Button>
      </form>

      {plan.status !== "active" ? (
        <form action={finalizePlanApproval}>
          <input type="hidden" name="planId" value={plan.id} />
          <Button type="submit" disabled={!allApproved}>
            Approve plan & create campaigns
          </Button>
          {!allApproved ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Approve every section above before finalizing.
            </p>
          ) : null}
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Plan is active — campaigns and tasks were created.
        </p>
      )}
    </div>
  );
}

function SectionCard({
  sectionKey,
  label,
  approved,
  planId,
  content,
}: {
  sectionKey: PlanSectionKey;
  label: string;
  approved: boolean;
  planId: string;
  content: ReactNode;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {label}{" "}
          <span className="text-xs text-muted-foreground">
            {approved ? "· approved" : "· pending"}
          </span>
        </p>
        {!approved ? (
          <form action={approvePlanSection}>
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="section" value={sectionKey} />
            <Button type="submit" size="sm">
              Approve section
            </Button>
          </form>
        ) : null}
      </div>
      {content}
    </div>
  );
}

function SectionBody({
  section,
  doc,
}: {
  section: PlanSectionKey;
  doc: PlanDocument;
}) {
  switch (section) {
    case "objectives":
      return (
        <ul className="space-y-2 text-sm">
          {(doc.objectives ?? []).map((o) => (
            <li key={o.title}>
              <p className="font-medium">{o.title}</p>
              <p className="text-muted-foreground">{o.description}</p>
              <p className="text-xs">Success: {o.success_metric}</p>
            </li>
          ))}
        </ul>
      );
    case "strategies":
      return (
        <ul className="space-y-2 text-sm">
          {(doc.strategies ?? []).map((s) => (
            <li key={s.title}>
              <p className="font-medium">{s.title}</p>
              <p className="text-muted-foreground">{s.rationale}</p>
            </li>
          ))}
        </ul>
      );
    case "campaigns":
      return (
        <ul className="space-y-2 text-sm">
          {(doc.campaigns ?? []).map((c) => (
            <li key={c.key} className="rounded-lg border p-2">
              <p className="font-medium">{c.name}</p>
              <p className="text-muted-foreground">{c.goal}</p>
              <p className="text-xs">
                {c.channels.join(", ")} · {formatPence(c.budget_pence)}
              </p>
            </li>
          ))}
        </ul>
      );
    case "channel_tactics":
      return (
        <ul className="space-y-2 text-sm">
          {(doc.channel_tactics ?? []).map((c) => (
            <li key={c.channel}>
              <p className="font-medium">
                {c.channel} · {c.budget_pct}%
              </p>
              <p className="text-muted-foreground">{c.tactics.join(" · ")}</p>
            </li>
          ))}
        </ul>
      );
    case "budget_split":
      return (
        <ul className="space-y-2 text-sm">
          {(doc.budget_split ?? []).map((b) => (
            <li key={b.channel}>
              <span className="font-medium">{b.channel}</span> ·{" "}
              {formatPence(b.amount_pence)} — {b.rationale}
            </li>
          ))}
        </ul>
      );
    case "kpi_targets":
      return (
        <ul className="space-y-2 text-sm">
          {(doc.kpi_targets ?? []).map((k) => (
            <li key={k.metric}>
              {k.metric}: {k.target}
              {k.unit ? ` ${k.unit}` : ""}
            </li>
          ))}
        </ul>
      );
    case "task_breakdown":
      return (
        <ul className="space-y-2 text-sm">
          {(doc.task_breakdown ?? []).map((t, i) => (
            <li key={`${t.campaign_key}-${i}`}>
              <span className="font-medium">{t.title}</span> · {t.module} ·{" "}
              {t.assignee_type}
              <p className="text-muted-foreground">{t.description}</p>
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}
