import { notFound } from "next/navigation";

import { RankBars } from "@/components/seo/rank-bars";
import { SeoNav } from "@/components/seo/seo-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { SeoGscDaily, SeoKeyword } from "@/lib/types/seo";

export default async function SeoRanksPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("seo_projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!project) notFound();

  const since = new Date();
  since.setDate(since.getDate() - 28);

  const [{ data: keywords }, { data: gsc }] = await Promise.all([
    supabase
      .from("seo_keywords")
      .select("*")
      .eq("project_id", projectId)
      .eq("tracked", true)
      .order("current_position", { ascending: true, nullsFirst: false }),
    supabase
      .from("seo_gsc_daily")
      .select("*")
      .eq("project_id", projectId)
      .gte("metric_date", since.toISOString().slice(0, 10)),
  ]);

  const byDate = new Map<string, { sum: number; n: number }>();
  for (const row of (gsc ?? []) as SeoGscDaily[]) {
    const cur = byDate.get(row.metric_date) ?? { sum: 0, n: 0 };
    cur.sum += Number(row.position);
    cur.n += 1;
    byDate.set(row.metric_date, cur);
  }
  const points = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, position: v.sum / v.n }));

  return (
    <div className="space-y-6">
      <div>
        <SeoNav projectId={projectId} current={`/seo/projects/${projectId}/ranks`} />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Rank tracking</h1>
        <p className="mt-2 text-muted-foreground">
          Positions from GSC average position for tracked queries.
        </p>
      </div>

      <div className="rounded-xl border p-4">
        <p className="mb-3 text-sm font-medium">Average position (28d)</p>
        <RankBars points={points} />
      </div>

      <div className="rounded-xl border">
        <div className="border-b p-3 text-sm font-medium">Tracked keywords</div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="p-3">Keyword</th>
              <th className="p-3">Position</th>
              <th className="p-3">Change</th>
              <th className="p-3">Priority</th>
            </tr>
          </thead>
          <tbody>
            {((keywords ?? []) as SeoKeyword[]).map((kw) => {
              const delta =
                kw.current_position != null && kw.previous_position != null
                  ? Number(kw.previous_position) - Number(kw.current_position)
                  : null;
              return (
                <tr key={kw.id} className="border-b">
                  <td className="p-3">{kw.keyword}</td>
                  <td className="p-3">
                    {kw.current_position != null ? kw.current_position : "—"}
                  </td>
                  <td className="p-3">
                    {delta == null
                      ? "—"
                      : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
                  </td>
                  <td className="p-3">{kw.priority}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
