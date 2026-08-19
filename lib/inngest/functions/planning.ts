import { inngest } from "@/lib/inngest/client";
import {
  executeAiTask,
  refreshAllActiveCampaignKpis,
  runDueAiTasks,
} from "@/lib/planning/execution";

/** Daily: run due AI-assigned planning tasks and refresh KPIs. */
export const planningDailyExecution = inngest.createFunction(
  {
    id: "planning/daily-execution",
    retries: 1,
    triggers: [{ cron: "0 6 * * *" }],
  },
  async ({ step }) => {
    const tasks = await step.run("run-ai-tasks", async () => runDueAiTasks(25));
    const kpis = await step.run("refresh-kpis", async () =>
      refreshAllActiveCampaignKpis(),
    );
    return { tasks, kpis };
  },
);

export const planningExecuteTaskNow = inngest.createFunction(
  {
    id: "planning/execute-task-now",
    retries: 1,
    triggers: [{ event: "planning/task.execute" }],
  },
  async ({ event, step }) => {
    const { taskId } = event.data as { taskId: string };
    return step.run("execute", async () => executeAiTask(taskId));
  },
);

export const planningGenerateMarketingPlan = inngest.createFunction(
  {
    id: "planning/generate-marketing-plan",
    retries: 1,
    triggers: [{ event: "planning/generate" }],
  },
  async ({ event, step }) => {
    const data = event.data as {
      organizationId: string;
      brandId: string;
      userId: string;
      planId: string;
      agentRunId: string;
      goalBrief: string;
      periodType: string;
      periodStart: string;
      periodEnd: string;
      budgetPence: number | null;
    };
    return step.run("generate-plan", async () => {
      const { runMarketingPlanGeneration } = await import(
        "@/lib/planning/generate-plan-job"
      );
      return runMarketingPlanGeneration({
        ...data,
        periodType: data.periodType as import("@/lib/types/planning").MarketingPlanPeriod,
      });
    });
  },
);

export const planningFunctions = [
  planningDailyExecution,
  planningExecuteTaskNow,
  planningGenerateMarketingPlan,
];
