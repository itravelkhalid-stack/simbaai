import { inngest } from "@/lib/inngest/client";
import {
  generateWeeklySummariesForAll,
  runTechnicalAudit,
  syncAllGscProjects,
} from "@/lib/seo/jobs";
import { syncGscDailyForProject } from "@/lib/seo/gsc";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SeoProject } from "@/lib/types/seo";

export const syncGscDaily = inngest.createFunction(
  {
    id: "seo/sync-gsc-daily",
    retries: 1,
    triggers: [{ cron: "0 5 * * *" }],
  },
  async ({ step }) => step.run("sync-all", async () => syncAllGscProjects()),
);

export const syncGscProjectNow = inngest.createFunction(
  {
    id: "seo/sync-gsc-project",
    retries: 1,
    triggers: [{ event: "seo/gsc.sync" }],
  },
  async ({ event, step }) => {
    const { projectId } = event.data as { projectId: string };
    return step.run("sync", async () => {
      const supabase = createAdminClient();
      const { data: project } = await supabase
        .from("seo_projects")
        .select("*")
        .eq("id", projectId)
        .single();
      if (!project) throw new Error("Project not found");
      return syncGscDailyForProject(project as SeoProject, 14);
    });
  },
);

export const runSeoAuditJob = inngest.createFunction(
  {
    id: "seo/run-technical-audit",
    retries: 1,
    triggers: [{ event: "seo/audit.run" }],
  },
  async ({ event, step }) => {
    const { projectId } = event.data as { projectId: string };
    return step.run("audit", async () => runTechnicalAudit(projectId));
  },
);

export const weeklySeoSummaryJob = inngest.createFunction(
  {
    id: "seo/weekly-summary",
    retries: 1,
    triggers: [{ cron: "0 9 * * 1" }],
  },
  async ({ step }) =>
    step.run("summaries", async () => generateWeeklySummariesForAll()),
);

export const seoFunctions = [
  syncGscDaily,
  syncGscProjectNow,
  runSeoAuditJob,
  weeklySeoSummaryJob,
];
