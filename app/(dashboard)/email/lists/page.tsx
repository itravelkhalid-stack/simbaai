import { EmailNav } from "@/components/email/email-nav";
import { ListsManager } from "@/components/email/lists-manager";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { EmailList } from "@/lib/types/email";

export default async function EmailListsPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_lists")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Lists</h1>
        <p className="mt-2 text-muted-foreground">
          Audience lists for campaigns and welcome flows.
        </p>
      </div>
      <EmailNav current="/email/lists" />
      <ListsManager lists={(data ?? []) as EmailList[]} />
    </div>
  );
}
