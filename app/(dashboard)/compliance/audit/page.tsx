import { ComplianceNav } from "@/components/compliance/compliance-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldSelectClass } from "@/lib/ui/field";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { AuditEvent } from "@/lib/types/compliance";
import { AUDIT_ACTION_LABELS } from "@/lib/types/compliance";

export default async function ComplianceAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entityType?: string; q?: string }>;
}) {
  const { active } = await requireActiveOrg();
  const params = await searchParams;

  if (active.role !== "org_owner" && active.role !== "org_admin") {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Only org admins can view the audit log.
        </p>
        <ComplianceNav current="/compliance/audit" />
      </div>
    );
  }

  const supabase = await createClient();
  let query = supabase
    .from("audit_events")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (params.action) query = query.eq("action", params.action);
  if (params.entityType) query = query.eq("entity_type", params.entityType);
  if (params.q) query = query.ilike("summary", `%${params.q}%`);

  const { data } = await query;
  const events = (data ?? []) as AuditEvent[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
        <p className="mt-2 text-muted-foreground">
          Immutable record of approvals, publishes, overrides, budget and
          settings changes.
        </p>
      </div>
      <ComplianceNav current="/compliance/audit" />

      <form method="get" className="flex flex-wrap gap-2 rounded-xl border p-3 text-sm">
        <select
          name="action"
          defaultValue={params.action ?? ""}
          className={fieldSelectClass}
        >
          <option value="">All actions</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <Input
          name="entityType"
          placeholder="Entity type"
          defaultValue={params.entityType ?? ""}
        />
        <Input
          name="q"
          placeholder="Search summary"
          defaultValue={params.q ?? ""}
          className="flex-1"
        />
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      <ul className="divide-y rounded-xl border text-sm">
        {events.length === 0 ? (
          <li className="p-4 text-muted-foreground">No audit events.</li>
        ) : (
          events.map((e) => (
            <li key={e.id} className="space-y-1 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {AUDIT_ACTION_LABELS[e.action] ?? e.action} · {e.entity_type}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()}
                </p>
              </div>
              <p>{e.summary}</p>
              {e.entity_id ? (
                <p className="text-xs text-muted-foreground">
                  Entity: {e.entity_id}
                </p>
              ) : null}
              {(e.before_state || e.after_state) && (
                <details className="text-xs text-muted-foreground">
                  <summary>Before / after</summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2">
                    {JSON.stringify(
                      { before: e.before_state, after: e.after_state },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
