import Link from "next/link";

import { EmailNav } from "@/components/email/email-nav";
import { FlowProposeForm } from "@/components/email/flow-propose-form";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { EmailFlow, EmailList } from "@/lib/types/email";

export default async function EmailFlowsPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const [{ data: flows }, { data: lists }] = await Promise.all([
    supabase
      .from("email_flows")
      .select("*")
      .eq("organization_id", active.organization_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("email_lists")
      .select("*")
      .eq("organization_id", active.organization_id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Flows</h1>
        <p className="mt-2 text-muted-foreground">
          AI proposes a multi-email sequence strategy for approval, then writes each
          email.
        </p>
      </div>
      <EmailNav current="/email/flows" />
      <FlowProposeForm lists={(lists ?? []) as EmailList[]} />
      <ul className="divide-y rounded-xl border">
        {((flows ?? []) as EmailFlow[]).length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">No flows yet.</li>
        ) : (
          ((flows ?? []) as EmailFlow[]).map((flow) => (
            <li key={flow.id} className="p-4">
              <Link href={`/email/flows/${flow.id}`} className="font-medium underline">
                {flow.name}
              </Link>
              <p className="text-sm text-muted-foreground">
                {flow.trigger_type} · {flow.status}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
