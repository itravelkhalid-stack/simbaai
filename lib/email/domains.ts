import { Resend } from "resend";

import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailDomainStatus, EmailSendingDomain } from "@/lib/types/email";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  return new Resend(key);
}

function mapDomainStatus(status?: string | null): EmailDomainStatus {
  switch (status) {
    case "verified":
      return "verified";
    case "pending":
      return "pending";
    case "failed":
      return "failed";
    case "temporary_failure":
      return "temporary_failure";
    default:
      return "not_started";
  }
}

export async function createOrgSendingDomain(params: {
  organizationId: string;
  brandId: string;
  domain: string;
  fromName?: string;
  physicalAddress?: string;
}) {
  const resend = getResend();
  const domain = params.domain.trim().toLowerCase();

  const { data, error } = await resend.domains.create({ name: domain });
  if (error) throw new Error(error.message);

  const records = (data?.records ?? []) as unknown as Array<Record<string, unknown>>;
  const supabase = createAdminClient();
  const { data: row, error: dbError } = await supabase
    .from("email_sending_domains")
    .upsert(
      {
        organization_id: params.organizationId,
        brand_id: params.brandId,
        domain,
        resend_domain_id: data?.id ?? null,
        status: mapDomainStatus(data?.status),
        dns_records: records,
        from_email: `hello@${domain}`,
        from_name: params.fromName ?? null,
        physical_address: params.physicalAddress ?? null,
      },
      { onConflict: "organization_id,domain" },
    )
    .select("*")
    .single();

  if (dbError) throw new Error(dbError.message);
  return row as EmailSendingDomain;
}

export async function refreshOrgSendingDomain(domainRow: EmailSendingDomain) {
  if (!domainRow.resend_domain_id) {
    throw new Error("Domain is missing Resend domain id");
  }
  const resend = getResend();
  const { data, error } = await resend.domains.get(domainRow.resend_domain_id);
  if (error) throw new Error(error.message);

  const status = mapDomainStatus(data?.status);
  const supabase = createAdminClient();
  const { data: updated, error: dbError } = await supabase
    .from("email_sending_domains")
    .update({
      status,
      dns_records: (data?.records ?? domainRow.dns_records) as unknown as Array<
        Record<string, unknown>
      >,
      verified_at: status === "verified" ? new Date().toISOString() : null,
    })
    .eq("id", domainRow.id)
    .select("*")
    .single();

  if (dbError) throw new Error(dbError.message);
  return updated as EmailSendingDomain;
}
