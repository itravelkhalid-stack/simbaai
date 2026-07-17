import { notFound } from "next/navigation";

import { CsvImportForm } from "@/components/email/csv-import-form";
import { EmailNav } from "@/components/email/email-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { EmailList, EmailSubscriber } from "@/lib/types/email";

export default async function EmailListDetailPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data: list } = await supabase
    .from("email_lists")
    .select("*")
    .eq("id", listId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!list) notFound();

  const { data: subscribers } = await supabase
    .from("email_subscribers")
    .select("*")
    .eq("list_id", listId)
    .eq("organization_id", active.organization_id)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: lists } = await supabase
    .from("email_lists")
    .select("*")
    .eq("organization_id", active.organization_id);

  return (
    <div className="space-y-6">
      <div>
        <EmailNav current="/email/lists" />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          {(list as EmailList).name}
        </h1>
      </div>

      <CsvImportForm lists={(lists ?? []) as EmailList[]} />

      <div className="rounded-xl border">
        <ul className="divide-y">
          {((subscribers ?? []) as EmailSubscriber[]).map((sub) => (
            <li key={sub.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="font-medium">{sub.email}</p>
                <p className="text-muted-foreground">
                  {[sub.first_name, sub.last_name].filter(Boolean).join(" ") || "—"}
                </p>
              </div>
              <p className="text-muted-foreground">{sub.status}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
