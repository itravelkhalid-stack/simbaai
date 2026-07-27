import {
  approveGuidelinesProposal,
  rejectGuidelinesProposal,
} from "@/lib/media/actions";
import type { BrandGuidelinesProposal } from "@/lib/types/media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SimbaBadge } from "@/components/brand/ai-content";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function DiffSection({
  label,
  before,
  after,
}: {
  label: string;
  before: unknown;
  after: unknown;
}) {
  const beforeText =
    typeof before === "string"
      ? before
      : Array.isArray(before)
        ? before.join(", ")
        : before
          ? JSON.stringify(before)
          : "—";
  const afterText =
    typeof after === "string"
      ? after
      : Array.isArray(after)
        ? after.join(", ")
        : after
          ? JSON.stringify(after)
          : "—";
  if (beforeText === afterText) return null;
  return (
    <div className="grid gap-2 rounded-md bg-surface p-3 text-sm ring-1 ring-border md:grid-cols-2">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">
          {label} · current
        </p>
        <p className="mt-1 whitespace-pre-wrap text-ink-soft">{beforeText}</p>
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
          {label} · proposed
        </p>
        <p className="mt-1 whitespace-pre-wrap text-ink">{afterText}</p>
      </div>
    </div>
  );
}

export function GuidelinesProposalPanel({
  proposals,
  canWrite,
}: {
  proposals: BrandGuidelinesProposal[];
  canWrite: boolean;
}) {
  const pending = proposals.filter((p) => p.status === "pending");
  if (pending.length === 0) return null;

  return (
    <div className="space-y-4 rounded-lg bg-warning-soft p-5 ring-1 ring-warning/40">
      <div className="flex flex-wrap items-center gap-2">
        <SimbaBadge />
        <h2 className="font-heading text-lg font-semibold text-ink">
          Guidelines extraction awaiting approval
        </h2>
      </div>
      <p className="text-sm text-ink-soft">
        Review the proposed changes from the uploaded PDF. Nothing is applied
        until you approve.
      </p>
      {pending.map((proposal) => {
        const current = asRecord(proposal.current_snapshot);
        const proposed = asRecord(proposal.proposed);
        const currentG = asRecord(current.guidelines);
        const proposedG = asRecord(proposed.guidelines);
        return (
          <div
            key={proposal.id}
            className="space-y-3 rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning">Pending</Badge>
              <p className="text-sm text-ink-soft">
                {proposal.summary || "Extracted guidelines proposal"}
              </p>
            </div>
            <DiffSection
              label="Brand voice"
              before={current.brand_voice}
              after={proposed.brand_voice}
            />
            <DiffSection
              label="Primary color"
              before={current.primary_color}
              after={proposed.primary_color}
            />
            <DiffSection
              label="Secondary color"
              before={current.secondary_color}
              after={proposed.secondary_color}
            />
            <DiffSection
              label="Accent color"
              before={current.accent_color}
              after={proposed.accent_color}
            />
            <DiffSection
              label="Heading font"
              before={current.font_heading}
              after={proposed.font_heading}
            />
            <DiffSection
              label="Body font"
              before={current.font_body}
              after={proposed.font_body}
            />
            <DiffSection label="Tone" before={currentG.tone} after={proposedG.tone} />
            <DiffSection
              label="Do say"
              before={currentG.do_say}
              after={proposedG.do_say}
            />
            <DiffSection
              label="Don't say"
              before={currentG.dont_say}
              after={proposedG.dont_say}
            />
            <DiffSection
              label="Value props"
              before={currentG.value_props}
              after={proposedG.value_props}
            />
            <DiffSection
              label="Vocabulary"
              before={currentG.vocabulary}
              after={proposedG.vocabulary}
            />
            <DiffSection
              label="Summary"
              before={currentG.summary}
              after={proposedG.summary}
            />
            {canWrite ? (
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <form action={approveGuidelinesProposal}>
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <Button type="submit">Approve & apply</Button>
                </form>
                <form action={rejectGuidelinesProposal}>
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <Button type="submit" variant="destructive">
                    Reject
                  </Button>
                </form>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
