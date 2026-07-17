import Link from "next/link";

import { ResearchLibrary } from "@/components/research/research-library";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type {
  ResearchProject,
  ResearchProjectStatus,
  ResearchProjectType,
} from "@/lib/types/research";
import { cn } from "@/lib/utils";

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const params = await searchParams;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  let query = supabase
    .from("research_projects")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("updated_at", { ascending: false });

  if (params.type) {
    query = query.eq("type", params.type as ResearchProjectType);
  }
  if (params.status) {
    query = query.eq("status", params.status as ResearchProjectStatus);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Research</h1>
          <p className="mt-2 text-muted-foreground">
            Brand, competitor, market, and audience intelligence for{" "}
            {active.organization.name}.
          </p>
        </div>
        <Link href="/research/new" className={cn(buttonVariants())}>
          New research
        </Link>
      </div>

      <ResearchLibrary
        projects={(data ?? []) as ResearchProject[]}
        typeFilter={params.type}
        statusFilter={params.status}
      />
    </div>
  );
}
