import { decideCeoHire } from "@/lib/ceo/actions";
import { getAgentById } from "@/lib/agents/registry";
import { Button } from "@/components/ui/button";

export function CeoHireProposals({
  proposals,
}: {
  proposals: Array<{
    id: string;
    agent_id: string;
    mandate: string;
    proposed_reason: string | null;
    brand_id: string;
    status: string;
  }>;
}) {
  if (!proposals.length) return null;

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-ink">
          CEO hiring proposals
        </h2>
        <p className="text-sm text-muted-foreground">
          Activate a real registry agent for a brand — never invents agents.
        </p>
      </div>
      <ul className="space-y-3">
        {proposals.map((p) => {
          const entry = getAgentById(p.agent_id);
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-start justify-between gap-3 border-b pb-3 last:border-0"
            >
              <div className="space-y-1 text-sm">
                <p className="font-medium">
                  {entry?.displayName ?? p.agent_id}
                </p>
                <p className="text-muted-foreground">{p.mandate}</p>
                {p.proposed_reason ? (
                  <p className="text-xs text-muted-foreground">
                    {p.proposed_reason}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <form action={decideCeoHire}>
                  <input type="hidden" name="activationId" value={p.id} />
                  <input type="hidden" name="decision" value="activate" />
                  <Button type="submit" size="sm">
                    Hire
                  </Button>
                </form>
                <form action={decideCeoHire}>
                  <input type="hidden" name="activationId" value={p.id} />
                  <input type="hidden" name="decision" value="decline" />
                  <Button type="submit" size="sm" variant="outline">
                    Decline
                  </Button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
