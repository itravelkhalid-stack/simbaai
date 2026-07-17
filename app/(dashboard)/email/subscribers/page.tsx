import { EmailNav } from "@/components/email/email-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { EmailSubscriber } from "@/lib/types/email";
import { addTagToSubscriber } from "@/lib/email/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function EmailSubscribersPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_subscribers")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Subscribers</h1>
        <p className="mt-2 text-muted-foreground">
          Manage contacts, tags, and consent status. Unsubscribes and bounces land on
          the suppression list automatically.
        </p>
      </div>
      <EmailNav current="/email/subscribers" />
      <div className="rounded-xl border">
        <ul className="divide-y">
          {((data ?? []) as EmailSubscriber[]).map((sub) => (
            <li key={sub.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{sub.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {sub.status}
                    {sub.source ? ` · ${sub.source}` : ""}
                    {sub.consent_timestamp
                      ? ` · consent ${new Date(sub.consent_timestamp).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
              </div>
              <form action={addTagToSubscriber} className="flex gap-2">
                <input type="hidden" name="subscriberId" value={sub.id} />
                <Input name="tag" placeholder="Add tag" className="max-w-xs" />
                <Button type="submit" size="sm" variant="outline">
                  Tag
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
