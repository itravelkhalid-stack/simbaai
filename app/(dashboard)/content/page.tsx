import Link from "next/link";

import { ContentNav } from "@/components/content/content-nav";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function ContentHomePage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const [
    { count: pending },
    { count: scheduled },
    { count: pillars },
    { data: recentPlans },
  ] = await Promise.all([
    supabase
      .from("content_items")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", active.organization_id)
      .eq("status", "pending_approval"),
    supabase
      .from("content_items")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", active.organization_id)
      .eq("status", "scheduled"),
    supabase
      .from("content_pillars")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", active.organization_id),
    supabase
      .from("content_plans")
      .select("id, title, status, updated_at")
      .eq("organization_id", active.organization_id)
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Content</h1>
          <p className="mt-2 text-muted-foreground">
            Generate, review, and schedule brand-safe content for{" "}
            {active.organization.name}.
          </p>
        </div>
        <Link href="/content/generate" className={cn(buttonVariants())}>
          Generate content
        </Link>
      </div>

      <ContentNav current="/content" />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{pending ?? 0}</CardTitle>
            <CardDescription>Pending approval</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{scheduled ?? 0}</CardTitle>
            <CardDescription>Scheduled</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{pillars ?? 0}</CardTitle>
            <CardDescription>Content pillars</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recent batch plans</h2>
        <ul className="space-y-2 text-sm">
          {(recentPlans ?? []).length === 0 ? (
            <li className="text-muted-foreground">No batch plans yet.</li>
          ) : (
            (recentPlans ?? []).map((plan) => (
              <li key={plan.id}>
                <Link href={`/content/plans/${plan.id}`} className="underline">
                  {plan.title}
                </Link>{" "}
                <span className="text-muted-foreground">· {plan.status}</span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
