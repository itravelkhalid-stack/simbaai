import Link from "next/link";

import { PlanningNav } from "@/components/planning/planning-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Campaign } from "@/lib/types/planning";

export default async function CampaignsListPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("start_date", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1>
        <p className="mt-2 text-muted-foreground">
          Execution hubs with live KPIs, tasks, and activity.
        </p>
      </div>
      <PlanningNav current="/planning/campaigns" />
      <ul className="divide-y rounded-xl border">
        {((data ?? []) as Campaign[]).length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">No campaigns yet.</li>
        ) : (
          ((data ?? []) as Campaign[]).map((c) => (
            <li key={c.id} className="flex justify-between gap-3 p-4">
              <div>
                <Link
                  href={`/planning/campaigns/${c.id}`}
                  className="font-medium underline"
                >
                  {c.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {c.status} · {(c.channels ?? []).join(", ")}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {c.start_date ?? "—"} → {c.end_date ?? "—"}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
