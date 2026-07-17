import JSZip from "jszip";

import { createAdminClient } from "@/lib/supabase/admin";

const EXPORT_TABLES = [
  "brands",
  "organization_members",
  "content_items",
  "content_metrics",
  "ad_campaigns",
  "ad_creatives",
  "ad_metrics_daily",
  "email_campaigns",
  "email_subscribers",
  "seo_articles",
  "crm_contacts",
  "crm_deals",
  "crm_orders",
  "budgets",
  "expenses",
  "revenue_records",
  "analytics_daily",
  "compliance_profiles",
  "compliance_checks",
  "audit_events",
  "notifications",
  "meetings",
  "reports",
] as const;

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s =
      typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [
    keys.join(","),
    ...rows.map((r) => keys.map((k) => escape(r[k])).join(",")),
  ].join("\n");
}

export async function buildOrganizationDataExport(organizationId: string) {
  const supabase = createAdminClient();
  const zip = new JSZip();
  const manifest: Record<string, number> = {};

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .single();

  zip.file(
    "organization.json",
    JSON.stringify(org ?? { id: organizationId }, null, 2),
  );

  for (const table of EXPORT_TABLES) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("organization_id", organizationId)
        .limit(10000);
      if (error) {
        zip.file(`${table}.error.txt`, error.message);
        continue;
      }
      const rows = (data ?? []) as Record<string, unknown>[];
      manifest[table] = rows.length;
      zip.folder("json")?.file(`${table}.json`, JSON.stringify(rows, null, 2));
      zip.folder("csv")?.file(`${table}.csv`, toCsv(rows));
    } catch (err) {
      zip.file(
        `${table}.error.txt`,
        err instanceof Error ? err.message : "export failed",
      );
    }
  }

  // profiles are keyed by user id, not org — export member profiles separately
  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId);
  const userIds = [...new Set((members ?? []).map((m) => m.user_id))];
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, created_at, updated_at")
      .in("id", userIds);
    const rows = (profiles ?? []) as Record<string, unknown>[];
    manifest.member_profiles = rows.length;
    zip.folder("json")?.file("member_profiles.json", JSON.stringify(rows, null, 2));
    zip.folder("csv")?.file("member_profiles.csv", toCsv(rows));
  }

  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        organization_id: organizationId,
        exported_at: new Date().toISOString(),
        tables: manifest,
      },
      null,
      2,
    ),
  );

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  return buffer;
}
