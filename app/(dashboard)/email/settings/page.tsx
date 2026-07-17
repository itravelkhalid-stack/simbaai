import { EmailNav } from "@/components/email/email-nav";
import { DomainSettings } from "@/components/email/domain-settings";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { EmailSendingDomain } from "@/lib/types/email";

export default async function EmailSettingsPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const [{ data: domains }, { data: suppressed }] = await Promise.all([
    supabase
      .from("email_sending_domains")
      .select("*")
      .eq("organization_id", active.organization_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("email_suppression_list")
      .select("email, reason, created_at")
      .eq("organization_id", active.organization_id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Sending domains</h1>
        <p className="mt-2 text-muted-foreground">
          Verify domains in Resend, set physical address for CAN-SPAM footers, and
          review the suppression list.
        </p>
      </div>
      <EmailNav current="/email/settings" />
      <DomainSettings domains={(domains ?? []) as EmailSendingDomain[]} />

      <div className="rounded-xl border p-4">
        <p className="mb-3 text-sm font-medium">Suppression list (recent)</p>
        {(suppressed ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Empty.</p>
        ) : (
          <ul className="divide-y text-sm">
            {(suppressed ?? []).map((row) => (
              <li
                key={`${row.email}-${row.created_at}`}
                className="flex justify-between gap-2 py-2"
              >
                <span>{row.email}</span>
                <span className="text-muted-foreground">{row.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
