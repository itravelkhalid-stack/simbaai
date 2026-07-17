import { writeAuditEvent } from "@/lib/compliance/audit";
import { getLatestComplianceCheck } from "@/lib/compliance/check";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrgMemberRole } from "@/lib/types/database";
import type {
  ComplianceCheck,
  ComplianceEntityType,
} from "@/lib/types/compliance";

export class ComplianceBlockedError extends Error {
  check: ComplianceCheck;
  constructor(check: ComplianceCheck) {
    super(
      "Compliance check failed. An org admin must override with a logged reason before approval.",
    );
    this.name = "ComplianceBlockedError";
    this.check = check;
  }
}

function canOverride(role: OrgMemberRole) {
  return role === "org_owner" || role === "org_admin";
}

/**
 * Blocks approval when latest check is `fail` unless org_admin/owner
 * provides overrideReason. Records override + audit event.
 */
export async function assertComplianceAllowsApproval(params: {
  organizationId: string;
  entityType: ComplianceEntityType;
  entityId: string;
  userId: string;
  role: OrgMemberRole;
  overrideReason?: string | null;
  actionLabel?: string;
}): Promise<{ check: ComplianceCheck | null; overridden: boolean }> {
  const check = await getLatestComplianceCheck({
    organizationId: params.organizationId,
    entityType: params.entityType,
    entityId: params.entityId,
  });

  if (!check || check.status !== "fail") {
    return { check, overridden: false };
  }

  // Already overridden
  if (check.override_by && check.override_reason) {
    return { check, overridden: true };
  }

  const reason = params.overrideReason?.trim() ?? "";
  if (!canOverride(params.role) || reason.length < 8) {
    throw new ComplianceBlockedError(check);
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  await supabase
    .from("compliance_checks")
    .update({
      override_by: params.userId,
      override_reason: reason,
      overridden_at: now,
    })
    .eq("id", check.id)
    .eq("organization_id", params.organizationId);

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.userId,
    action: "compliance_override",
    entityType: params.entityType,
    entityId: params.entityId,
    summary: params.actionLabel ?? `Override compliance fail on ${params.entityType}`,
    before: { status: check.status, findings: check.findings },
    after: { override_reason: reason },
    meta: { check_id: check.id },
  });

  return {
    check: {
      ...check,
      override_by: params.userId,
      override_reason: reason,
      overridden_at: now,
    },
    overridden: true,
  };
}
