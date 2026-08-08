import { inngest } from "@/lib/inngest/client";

export const runCmoContentReview = inngest.createFunction(
  {
    id: "content/cmo-review",
    retries: 1,
    triggers: [{ event: "content/cmo.review" }],
  },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as {
      organizationId?: string;
      brandId?: string;
      itemIds?: string[];
      backfill?: boolean;
    };
    if (!data.organizationId || !data.brandId) {
      return { ok: false, error: "organizationId and brandId required" };
    }

    if (data.backfill || !data.itemIds?.length) {
      const { runCmoBackfillForBrand } = await import("@/lib/cmo/run");
      return step.run("cmo-backfill", () =>
        runCmoBackfillForBrand({
          organizationId: data.organizationId!,
          brandId: data.brandId!,
        }),
      );
    }

    const { reviewContentItemAsCmo } = await import("@/lib/cmo/approve");
    const results = [];
    for (const itemId of data.itemIds) {
      const result = await step.run(`cmo-${itemId}`, () =>
        reviewContentItemAsCmo({
          organizationId: data.organizationId!,
          brandId: data.brandId!,
          itemId,
        }),
      );
      results.push(result);
    }
    return { ok: true, results };
  },
);

export const cmoFunctions = [runCmoContentReview];
