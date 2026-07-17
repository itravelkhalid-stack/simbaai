import { inngest } from "@/lib/inngest/client";
import { runDailyFinanceIngestion } from "@/lib/finance/ingest";
import { runWeeklyFinanceAnalyst } from "@/lib/finance/analyst";

export const financeDailyIngestion = inngest.createFunction(
  {
    id: "finance/daily-ingestion",
    retries: 1,
    triggers: [{ cron: "20 5 * * *" }],
  },
  async ({ step }) => {
    return step.run("ingest", async () => runDailyFinanceIngestion());
  },
);

export const financeWeeklyAnalyst = inngest.createFunction(
  {
    id: "finance/weekly-analyst",
    retries: 1,
    triggers: [{ cron: "0 8 * * 1" }],
  },
  async ({ step }) => {
    return step.run("analyse", async () => runWeeklyFinanceAnalyst());
  },
);

export const financeFunctions = [financeDailyIngestion, financeWeeklyAnalyst];
