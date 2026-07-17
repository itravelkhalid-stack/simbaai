import { inngest } from "@/lib/inngest/client";
import { processDueOrganizationDeletions } from "@/lib/compliance/deletion";

export const complianceProcessDeletions = inngest.createFunction(
  {
    id: "compliance/process-deletions",
    retries: 1,
    triggers: [{ cron: "15 3 * * *" }],
  },
  async ({ step }) => {
    return step.run("delete-due-orgs", async () =>
      processDueOrganizationDeletions(),
    );
  },
);

export const complianceFunctions = [complianceProcessDeletions];
