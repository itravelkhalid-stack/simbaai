import Link from "next/link";

import { CreateProjectForm } from "@/components/seo/create-project-form";
import { EmptyState } from "@/components/brand/empty-state";
import { SeoNav } from "@/components/seo/seo-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { SeoProject } from "@/lib/types/seo";
import { PageHeader } from "@/components/dashboard/page-header";

export default async function SeoHomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const q = await searchParams;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from("seo_projects")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("created_at", { ascending: false });
  const projects = (data ?? []) as SeoProject[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="SEO"
        description={
          <>
            Projects, GSC sync, technical audits, keyword maps, and content pipeline for{" "}
            {active.organization.name}.
          </>
        }
      />
      <SeoNav current="/seo" />
      {q.error ? <p className="text-sm text-destructive">{q.error}</p> : null}
      <CreateProjectForm />
      {projects.length === 0 ? (
        <EmptyState
          title="Start your search growth engine"
          description="Create an SEO project to map keywords, surface technical fixes, and build an effective content pipeline."
        />
      ) : (
        <ul className="divide-y rounded-lg bg-card shadow-elevated ring-1 ring-border">
          {projects.map((project) => (
            <li key={project.id} className="flex justify-between gap-3 p-4">
              <div>
                <Link
                  href={`/seo/projects/${project.id}`}
                  className="font-medium underline"
                >
                  {project.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {project.domain}
                  {project.gsc_connected ? " · GSC connected" : " · GSC not connected"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
