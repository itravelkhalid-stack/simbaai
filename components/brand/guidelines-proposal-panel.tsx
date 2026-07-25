import {
  approveGuidelinesProposal,
  rejectGuidelinesProposal,
} from "@/lib/media/actions";
import type { BrandGuidelinesProposal } from "@/lib/types/media";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
    <div className="grid gap-2 rounded-lg border p-3 text-sm md:grid-cols-2">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label} (current)</p>
        <p className="whitespace-pre-wrap">{beforeText}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label} (proposed)</p>
        <p className="whitespace-pre-wrap">{afterText}</p>
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
    <div className="space-y-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div>
        <h2 className="text-lg font-medium">Guidelines extraction awaiting approval</h2>
        <p className="text-sm text-muted-foreground">
          Review the proposed changes from the uploaded PDF. Nothing is applied
          until you approve.
        </p>
      </div>
      {pending.map((proposal) => {
        const current = asRecord(proposal.current_snapshot);
        const proposed = asRecord(proposal.proposed);
        const currentG = asRecord(current.guidelines);
        const proposedG = asRecord(proposed.guidelines);
        return (
          <div key={proposal.id} className="space-y-3 rounded-xl border bg-background p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Pending</Badge>
              <p className="text-sm text-muted-foreground">
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
              <div className="flex flex-wrap gap-2">
                <form action={approveGuidelinesProposal}>
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <Button type="submit">Approve & apply</Button>
                </form>
                <form action={rejectGuidelinesProposal}>
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <Button type="submit" variant="outline">
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
