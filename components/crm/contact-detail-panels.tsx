"use client";

import { useActionState } from "react";

import {
  addContactNote,
  createDeal,
  draftContactFollowUp,
  scoreContactNow,
  updateContactStage,
  type CrmActionResult,
} from "@/lib/crm/actions";
import {
  ACTIVITY_TYPE_LABELS,
  LIFECYCLE_LABELS,
  LIFECYCLE_STAGES,
  type CrmActivity,
  type CrmContact,
  type CrmDeal,
  type CrmPipelineStage,
} from "@/lib/types/crm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fieldSelectClass } from "@/lib/ui/field";

const initial: CrmActionResult = {};

export function ContactDetailPanels({
  contact,
  activities,
  deals,
  stages,
}: {
  contact: CrmContact;
  activities: CrmActivity[];
  deals: CrmDeal[];
  stages: CrmPipelineStage[];
}) {
  const [noteState, noteAction, notePending] = useActionState(
    addContactNote,
    initial,
  );
  const [scoreState, scoreAction, scorePending] = useActionState(
    scoreContactNow,
    initial,
  );
  const [draftState, draftAction, draftPending] = useActionState(
    draftContactFollowUp,
    initial,
  );
  const [dealState, dealAction, dealPending] = useActionState(createDeal, initial);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <section className="rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                {contact.name || contact.email}
              </h2>
              <p className="text-sm text-muted-foreground">
                {contact.email}
                {contact.company ? ` · ${contact.company}` : ""}
                {contact.phone ? ` · ${contact.phone}` : ""}
              </p>
              <p className="mt-2 text-sm">
                {LIFECYCLE_LABELS[contact.lifecycle_stage]} · Revenue £
                {(contact.total_revenue_pence / 100).toFixed(2)}
                {contact.lead_score != null
                  ? ` · Score ${contact.lead_score}/100`
                  : ""}
              </p>
              {contact.lead_score_reasoning ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {contact.lead_score_reasoning}
                </p>
              ) : null}
              {(contact.tags ?? []).length ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Tags: {contact.tags.join(", ")}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={scoreAction}>
                <input type="hidden" name="contactId" value={contact.id} />
                <Button type="submit" size="sm" disabled={scorePending}>
                  {scorePending ? "Scoring…" : "AI lead score"}
                </Button>
              </form>
              <form action={draftAction}>
                <input type="hidden" name="contactId" value={contact.id} />
                <Button type="submit" size="sm" variant="outline" disabled={draftPending}>
                  {draftPending ? "Drafting…" : "AI follow-up"}
                </Button>
              </form>
            </div>
          </div>
          {scoreState.error || scoreState.success ? (
            <Alert className="mt-3" variant={scoreState.error ? "destructive" : "default"}>
              <AlertDescription>
                {scoreState.error || scoreState.success}
              </AlertDescription>
            </Alert>
          ) : null}
          {draftState.draft ? (
            <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{draftState.draft.subject}</p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-muted-foreground">
                {draftState.draft.body_markdown}
              </pre>
              <p className="mt-2 text-xs text-muted-foreground">
                {draftState.draft.rationale}
              </p>
            </div>
          ) : null}
          <form action={updateContactStage} className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="contactId" value={contact.id} />
            <div className="space-y-1">
              <Label>Lifecycle stage</Label>
              <select
                name="stage"
                defaultValue={contact.lifecycle_stage}
                className={fieldSelectClass}
              >
                {LIFECYCLE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {LIFECYCLE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm" variant="outline">
              Update stage
            </Button>
          </form>
        </section>

        <section className="rounded-xl border p-4">
          <h3 className="mb-3 text-sm font-medium">Activity timeline</h3>
          <ul className="mb-4 space-y-3">
            {activities.length === 0 ? (
              <li className="text-sm text-muted-foreground">No activity yet.</li>
            ) : (
              activities.map((a) => (
                <li key={a.id} className="rounded-lg border px-3 py-2 text-sm">
                  <p className="text-xs text-muted-foreground">
                    {ACTIVITY_TYPE_LABELS[a.type]} ·{" "}
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{a.content}</p>
                </li>
              ))
            )}
          </ul>
          <form action={noteAction} className="space-y-2">
            <input type="hidden" name="contactId" value={contact.id} />
            <div className="flex gap-2">
              <select
                name="type"
                className={fieldSelectClass}
                defaultValue="note"
              >
                {(["note", "email", "call", "meeting", "task"] as const).map(
                  (t) => (
                    <option key={t} value={t}>
                      {ACTIVITY_TYPE_LABELS[t]}
                    </option>
                  ),
                )}
              </select>
            </div>
            <Textarea name="content" placeholder="Log a note…" required rows={3} />
            {noteState.error || noteState.success ? (
              <Alert variant={noteState.error ? "destructive" : "default"}>
                <AlertDescription>
                  {noteState.error || noteState.success}
                </AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={notePending}>
              {notePending ? "Saving…" : "Add activity"}
            </Button>
          </form>
        </section>
      </div>

      <div className="space-y-4">
        <section className="rounded-xl border p-4">
          <h3 className="mb-3 text-sm font-medium">Deals</h3>
          <ul className="mb-4 space-y-2 text-sm">
            {deals.length === 0 ? (
              <li className="text-muted-foreground">No deals.</li>
            ) : (
              deals.map((d) => (
                <li key={d.id} className="rounded-lg border p-2">
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    £{(d.value_pence / 100).toFixed(0)} · {d.stage}
                  </p>
                </li>
              ))
            )}
          </ul>
          <form action={dealAction} className="space-y-2">
            <input type="hidden" name="brandId" value={contact.brand_id} />
            <input type="hidden" name="contactId" value={contact.id} />
            <Label>New deal</Label>
            <Input name="name" placeholder="Deal name" required />
            <Input name="value" type="number" step="0.01" placeholder="Value £" />
            <select
              name="stage"
              className={fieldSelectClass}
              defaultValue={stages[0]?.id ?? "discovery"}
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Input name="expectedClose" type="date" />
            {dealState.error || dealState.success ? (
              <Alert variant={dealState.error ? "destructive" : "default"}>
                <AlertDescription>
                  {dealState.error || dealState.success}
                </AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={dealPending}>
              {dealPending ? "Creating…" : "Create deal"}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
