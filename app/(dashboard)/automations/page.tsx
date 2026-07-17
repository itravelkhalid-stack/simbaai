import Link from "next/link";

import { AutomationsNav } from "@/components/automations/automations-nav";
import { Button } from "@/components/ui/button";
import { createBlankAutomation } from "@/lib/automations/actions";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Automation } from "@/lib/types/automations";
import {
  AUTOMATION_STATUS_LABELS,
  TRIGGER_TYPE_LABELS,
} from "@/lib/types/automations";

export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string }>;
}) {
  const { active } = await requireActiveOrg();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .eq("organization_id", active.organization_id)
    .order("name");

  const brandId = params.brandId || brands?.[0]?.id;

  if (!brandId) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Automations</h1>
        <p className="text-sm text-muted-foreground">Create a brand first.</p>
      </div>
    );
  }

  const { data: automations } = await supabase
    .from("automations")
    .select("*")
    .eq("organization_id", active.organization_id)
    .eq("brand_id", brandId)
    .order("updated_at", { ascending: false });

  const list = (automations ?? []) as Automation[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Automations</h1>
        <p className="mt-2 text-muted-foreground">
          Trigger → conditions → actions, with approval and budget safety rails.
        </p>
      </div>
      <AutomationsNav current="/automations" />

      <div className="flex flex-wrap gap-2">
        {(brands ?? []).map((b) => (
          <a
            key={b.id}
            href={`/automations?brandId=${b.id}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              b.id === brandId ? "bg-foreground text-background" : ""
            }`}
          >
            {b.name}
          </a>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <form action={createBlankAutomation}>
          <input type="hidden" name="brandId" value={brandId} />
          <input type="hidden" name="name" value="New automation" />
          <Button type="submit">New automation</Button>
        </form>
        <Link
          href={`/automations/recipes?brandId=${brandId}`}
          className="inline-flex h-9 items-center rounded-md border px-3 text-sm"
        >
          Browse recipes
        </Link>
      </div>

      <ul className="divide-y rounded-xl border">
        {list.length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">
            No automations yet. Start from a recipe or create a blank flow.
          </li>
        ) : (
          list.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <Link
                  href={`/automations/${a.id}`}
                  className="font-medium hover:underline"
                >
                  {a.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {TRIGGER_TYPE_LABELS[a.trigger.type]} ·{" "}
                  {AUTOMATION_STATUS_LABELS[a.status]} · {a.run_count} runs
                  {a.last_run_at
                    ? ` · last ${new Date(a.last_run_at).toLocaleString()}`
                    : ""}
                </p>
              </div>
              <Link
                href={`/automations/${a.id}`}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                Edit
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
