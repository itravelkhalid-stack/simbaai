import { inngest } from "@/lib/inngest/client";
import {
  runCeoCheckForBrand,
  runCeoChecksForAllBrands,
} from "@/lib/ceo/run";

/** Daily CEO accountability — before standup (06:45 UTC). */
export const ceoDailyCheck = inngest.createFunction(
  {
    id: "ceo/daily-check",
    retries: 1,
    triggers: [
      { cron: "45 6 * * *" },
      { event: "ceo/check.run" },
    ],
  },
  async ({ event, step }) => {
    const data = (event?.data ?? {}) as {
      organizationId?: string;
      brandId?: string;
      weekly?: boolean;
    };

    if (data.organizationId && data.brandId) {
      return step.run("ceo-one-brand", () =>
        runCeoCheckForBrand({
          organizationId: data.organizationId!,
          brandId: data.brandId!,
          weekly: Boolean(data.weekly),
        }),
      );
    }

    return step.run("ceo-all-brands", () =>
      runCeoChecksForAllBrands({ weekly: Boolean(data.weekly) }),
    );
  },
);

/** Mondays 06:50 UTC — weekly state-of-company flavour. */
export const ceoWeeklyCheck = inngest.createFunction(
  {
    id: "ceo/weekly-check",
    retries: 1,
    triggers: [{ cron: "50 6 * * 1" }],
  },
  async ({ step }) => {
    return step.run("ceo-weekly-all", () =>
      runCeoChecksForAllBrands({ weekly: true }),
    );
  },
);

export const ceoFunctions = [ceoDailyCheck, ceoWeeklyCheck];
