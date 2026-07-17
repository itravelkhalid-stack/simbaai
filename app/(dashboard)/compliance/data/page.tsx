import { ComplianceNav } from "@/components/compliance/compliance-nav";
import { Button } from "@/components/ui/button";
import {
  cancelOrgDeletionAction,
  requestOrgDeletionAction,
} from "@/lib/compliance/actions";
import { GRACE_DAYS } from "@/lib/compliance/deletion";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";

export default async function ComplianceDataPage() {
  const { active } = await requireActiveOrg();
  const isAdmin =
    active.role === "org_owner" || active.role === "org_admin";

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "id, name, slug, deletion_requested_at, deletion_scheduled_for",
    )
    .eq("id", active.organization_id)
    .single();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Data &amp; GDPR</h1>
        <p className="mt-2 text-muted-foreground">
          Export all organization data, or request permanent deletion with a{" "}
          {GRACE_DAYS}-day grace period.
        </p>
      </div>
      <ComplianceNav current="/compliance/data" />

      {!isAdmin ? (
        <p className="text-sm text-muted-foreground">
          Only org admins can export data or request deletion.
        </p>
      ) : (
        <>
          <section className="space-y-3 rounded-xl border p-4">
            <h2 className="text-sm font-medium">Data export</h2>
            <p className="text-sm text-muted-foreground">
              Download a ZIP of JSON + CSV for tenant tables (contacts, content,
              ads, finance, compliance, audit, etc.).
            </p>
            <a href="/api/compliance/export">
              <Button type="button">Download export ZIP</Button>
            </a>
          </section>

          <section className="space-y-3 rounded-xl border border-red-500/30 p-4">
            <h2 className="text-sm font-medium text-red-700 dark:text-red-400">
              Delete organization
            </h2>
            {org?.deletion_scheduled_for ? (
              <div className="space-y-3 text-sm">
                <p>
                  Deletion scheduled for{" "}
                  <strong>
                    {new Date(org.deletion_scheduled_for).toLocaleString()}
                  </strong>
                  {org.deletion_requested_at
                    ? ` (requested ${new Date(org.deletion_requested_at).toLocaleString()})`
                    : ""}
                  . Cancel anytime before then.
                </p>
                <form action={cancelOrgDeletionAction}>
                  <Button type="submit" variant="outline">
                    Cancel deletion
                  </Button>
                </form>
              </div>
            ) : (
              <form action={requestOrgDeletionAction} className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Type the org slug <code>{org?.slug}</code> or{" "}
                  <code>DELETE</code> to confirm. Data is permanently removed
                  after {GRACE_DAYS} days.
                </p>
                <input
                  name="confirm"
                  required
                  placeholder={org?.slug ?? "DELETE"}
                  className="flex h-9 w-full max-w-sm rounded-md border bg-transparent px-3 text-sm"
                />
                <Button type="submit" variant="destructive">
                  Request deletion
                </Button>
              </form>
            )}
          </section>
        </>
      )}
    </div>
  );
}
