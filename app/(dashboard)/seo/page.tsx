import Link from "next/link";

import { CreateProjectForm } from "@/components/seo/create-project-form";
import { SeoNav } from "@/components/seo/seo-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { SeoProject } from "@/lib/types/seo";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">SEO</h1>
        <p className="mt-2 text-muted-foreground">
          Projects, GSC sync, technical audits, keyword maps, and content pipeline for{" "}
          {active.organization.name}.
        </p>
      </div>
      <SeoNav current="/seo" />
      {q.error ? <p className="text-sm text-destructive">{q.error}</p> : null}
      <CreateProjectForm />
      <ul className="divide-y rounded-xl border">
        {((data ?? []) as SeoProject[]).length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">No SEO projects yet.</li>
        ) : (
          ((data ?? []) as SeoProject[]).map((project) => (
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
          ))
        )}
      </ul>
    </div>
  );
}
