import { writeAuditEvent } from "@/lib/compliance/audit";
import { createAdminClient } from "@/lib/supabase/admin";

const GRACE_DAYS = 30;

export function computeDeletionSchedule(from = new Date()) {
  const scheduled = new Date(from);
  scheduled.setUTCDate(scheduled.getUTCDate() + GRACE_DAYS);
  return scheduled;
}

export async function requestOrganizationDeletion(params: {
  organizationId: string;
  userId: string;
}) {
  const supabase = createAdminClient();
  const now = new Date();
  const scheduled = computeDeletionSchedule(now);

  const { error } = await supabase
    .from("organizations")
    .update({
      deletion_requested_at: now.toISOString(),
      deletion_scheduled_for: scheduled.toISOString(),
      deletion_requested_by: params.userId,
    })
    .eq("id", params.organizationId);
  if (error) throw new Error(error.message);

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.userId,
    action: "deletion_requested",
    entityType: "organization",
    entityId: params.organizationId,
    summary: `Organization deletion requested; scheduled for ${scheduled.toISOString().slice(0, 10)} (${GRACE_DAYS}-day grace).`,
    after: {
      deletion_scheduled_for: scheduled.toISOString(),
    },
  });

  return { scheduledFor: scheduled.toISOString(), graceDays: GRACE_DAYS };
}

export async function cancelOrganizationDeletion(params: {
  organizationId: string;
  userId: string;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      deletion_requested_at: null,
      deletion_scheduled_for: null,
      deletion_requested_by: null,
    })
    .eq("id", params.organizationId);
  if (error) throw new Error(error.message);

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.userId,
    action: "deletion_cancelled",
    entityType: "organization",
    entityId: params.organizationId,
    summary: "Organization deletion cancelled during grace period.",
  });
}

/** Hard-delete orgs whose grace period has elapsed (cascade removes tenant data). */
export async function processDueOrganizationDeletions() {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data: due } = await supabase
    .from("organizations")
    .select("id, name, deletion_scheduled_for")
    .not("deletion_scheduled_for", "is", null)
    .lte("deletion_scheduled_for", now)
    .limit(50);

  let deleted = 0;
  for (const org of due ?? []) {
    await writeAuditEvent({
      organizationId: org.id,
      actorUserId: null,
      action: "deletion_completed",
      entityType: "organization",
      entityId: org.id,
      summary: `Organization “${org.name}” permanently deleted after grace period.`,
      meta: { deletion_scheduled_for: org.deletion_scheduled_for },
    });
    const { error } = await supabase
      .from("organizations")
      .delete()
      .eq("id", org.id);
    if (!error) deleted += 1;
  }
  return { deleted, checked: due?.length ?? 0 };
}

export { GRACE_DAYS };
