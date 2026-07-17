import { NextResponse } from "next/server";

import { writeAuditEvent } from "@/lib/compliance/audit";
import { buildOrganizationDataExport } from "@/lib/compliance/export";
import { requireActiveOrg } from "@/lib/org/require";

export async function GET() {
  const { user, active } = await requireActiveOrg();
  if (active.role !== "org_owner" && active.role !== "org_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const buffer = await buildOrganizationDataExport(active.organization_id);

  await writeAuditEvent({
    organizationId: active.organization_id,
    actorUserId: user.id,
    action: "data_export",
    entityType: "organization",
    entityId: active.organization_id,
    summary: "Downloaded organization data export (GDPR)",
  });

  const filename = `growthos-export-${active.organization.slug}-${new Date().toISOString().slice(0, 10)}.zip`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
