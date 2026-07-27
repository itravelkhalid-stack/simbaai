"use client";

import { useActionState, useState, type ReactNode } from "react";

import { AiContentSurface, SimbaBadge } from "@/components/brand/ai-content";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  const approvedCount = PLAN_SECTIONS.filter((s) => approvals[s.key]).length;
  const allApproved = approvedCount === PLAN_SECTIONS.length;

  return (
    <div className="space-y-8">
      <AiContentSurface className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SimbaBadge />
          <Badge variant={plan.status === "active" ? "success" : "warning"}>
            {plan.status}
          </Badge>
        </div>
        <h2 className="font-heading text-2xl font-bold tracking-tight text-ink">
          {plan.title}
        </h2>
        <p className="max-w-[65ch] text-base leading-relaxed text-ink">
          {doc.summary}
        </p>
        <p className="text-sm text-ink-soft">
          {plan.period_start} → {plan.period_end}
          {plan.budget_pence != null ? ` · ${formatPence(plan.budget_pence)}` : ""}
        </p>
        <div className="pt-2">
          <div className="mb-1 flex justify-between text-xs text-ink-soft">
            <span>Section approvals</span>
            <span>
              {approvedCount}/{PLAN_SECTIONS.length}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{
                width: `${(approvedCount / PLAN_SECTIONS.length) * 100}%`,
              }}
            />
          </div>
        </div>
      </AiContentSurface>

      <div className="space-y-5">
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

      <details className="rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border">
        <summary className="cursor-pointer font-heading text-sm font-semibold text-ink">
          Advanced: edit raw document JSON
        </summary>
        <form action={saveAction} className="mt-4 space-y-3">
          <input type="hidden" name="planId" value={plan.id} />
          <Input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Plan title"
          />
          <Textarea
            name="document"
            rows={14}
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
      </details>

      {plan.status !== "active" ? (
        <div className="rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border">
          <form action={finalizePlanApproval}>
            <input type="hidden" name="planId" value={plan.id} />
            <Button type="submit" disabled={!allApproved} size="lg">
              Approve plan & create campaigns
            </Button>
          </form>
          {!allApproved ? (
            <p className="mt-2 text-sm text-ink-soft">
              Approve every section above before finalizing.
            </p>
          ) : (
            <p className="mt-2 text-sm text-primary">
              All sections approved — ready to activate.
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-success-soft px-4 py-3 text-sm text-ink ring-1 ring-success/30">
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
    <article
      className={cn(
        "rounded-lg bg-card p-6 shadow-elevated ring-1",
        approved ? "ring-success/40" : "ring-border",
      )}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-lg font-semibold text-ink">{label}</h3>
          <Badge variant={approved ? "success" : "warning"}>
            {approved ? "Approved" : "Pending"}
          </Badge>
        </div>
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
      <div className="max-w-[65ch]">{content}</div>
    </article>
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
        <ul className="space-y-4">
          {(doc.objectives ?? []).map((o) => (
            <li key={o.title} className="space-y-1">
              <p className="font-heading text-base font-semibold text-ink">
                {o.title}
              </p>
              <p className="text-sm leading-relaxed text-ink-soft">
                {o.description}
              </p>
              <p className="rounded-md bg-brand-soft px-3 py-2 text-xs text-ink">
                Success: {o.success_metric}
              </p>
            </li>
          ))}
        </ul>
      );
    case "strategies":
      return (
        <ul className="space-y-4">
          {(doc.strategies ?? []).map((s) => (
            <li key={s.title} className="space-y-1">
              <p className="font-heading text-base font-semibold text-ink">
                {s.title}
              </p>
              <p className="text-sm leading-relaxed text-ink-soft">
                {s.rationale}
              </p>
            </li>
          ))}
        </ul>
      );
    case "campaigns":
      return (
        <ul className="space-y-3">
          {(doc.campaigns ?? []).map((c) => (
            <li
              key={c.key}
              className="rounded-md bg-highlight px-4 py-3 ring-1 ring-border"
            >
              <p className="font-heading font-semibold text-ink">{c.name}</p>
              <p className="mt-1 text-sm text-ink-soft">{c.goal}</p>
              <p className="mt-2 text-xs text-ink-soft">
                {c.channels.join(", ")} · {formatPence(c.budget_pence)}
              </p>
            </li>
          ))}
        </ul>
      );
    case "channel_tactics":
      return (
        <ul className="space-y-3">
          {(doc.channel_tactics ?? []).map((c) => (
            <li key={c.channel}>
              <p className="font-heading font-semibold text-ink">
                {c.channel}{" "}
                <span className="font-sans text-sm font-normal text-ink-soft">
                  · {c.budget_pct}%
                </span>
              </p>
              <p className="text-sm text-ink-soft">{c.tactics.join(" · ")}</p>
            </li>
          ))}
        </ul>
      );
    case "budget_split":
      return (
        <ul className="space-y-2">
          {(doc.budget_split ?? []).map((b) => (
            <li
              key={b.channel}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2 text-sm last:border-0"
            >
              <span className="font-medium text-ink">{b.channel}</span>
              <span className="tabular-nums text-ink">
                {formatPence(b.amount_pence)}
              </span>
              <span className="w-full text-ink-soft">{b.rationale}</span>
            </li>
          ))}
        </ul>
      );
    case "kpi_targets":
      return (
        <ul className="space-y-2">
          {(doc.kpi_targets ?? []).map((k) => (
            <li
              key={k.metric}
              className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-sm last:border-0"
            >
              <span className="text-ink-soft">{k.metric}</span>
              <span className="font-heading font-semibold tabular-nums text-ink">
                {k.target}
                {k.unit ? ` ${k.unit}` : ""}
              </span>
            </li>
          ))}
        </ul>
      );
    case "task_breakdown":
      return (
        <ul className="space-y-3">
          {(doc.task_breakdown ?? []).map((t, i) => (
            <li
              key={`${t.campaign_key}-${i}`}
              className="rounded-md bg-brand-soft/60 px-3 py-2"
            >
              <p className="text-sm font-medium text-ink">
                {t.title}{" "}
                <span className="font-normal text-ink-soft">
                  · {t.module} · {t.assignee_type}
                </span>
              </p>
              <p className="mt-1 text-sm text-ink-soft">{t.description}</p>
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}
