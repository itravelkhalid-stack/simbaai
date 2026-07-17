import { createAdminClient } from "@/lib/supabase/admin";

export async function writeAuditEvent(params: {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  meta?: Record<string, unknown>;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("audit_events").insert({
    organization_id: params.organizationId,
    actor_user_id: params.actorUserId ?? null,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    summary: params.summary,
    before_state: params.before ?? null,
    after_state: params.after ?? null,
    meta: params.meta ?? {},
  });
  if (error) {
    // Audit must not break primary flows; log-ish via console for ops
    console.error("audit_events insert failed", error.message);
  }
}
