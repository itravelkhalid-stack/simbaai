import { z } from "zod";

import type { AdPlatform } from "@/lib/types/ads";

export const AD_BUDGET_ALLOCATION_MODES = [
  "manual_pct",
  "manual_amount",
  "ai_allocates",
] as const;

export type AdBudgetAllocationMode =
  (typeof AD_BUDGET_ALLOCATION_MODES)[number];

export const platformAllocationRowSchema = z.object({
  platform: z.enum(["meta", "tiktok", "google", "x", "bing"]),
  /** Percent of the monthly pot (0–100). Used by manual_pct and as hard pins in ai_allocates. */
  pct: z.number().min(0).max(100).optional().nullable(),
  /** Fixed share of the monthly pot in minor units. Used by manual_amount / hard pins. */
  amount_pence: z.number().int().nonnegative().optional().nullable(),
  /** When true (or when mode is manual_*), this row is a hard constraint for AI. */
  locked: z.boolean().optional(),
});

export type PlatformAllocationRow = z.infer<typeof platformAllocationRowSchema>;

export const platformAllocationsSchema = z
  .array(platformAllocationRowSchema)
  .default([]);

export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "year_month must be YYYY-MM");

export const brandBudgetMonthUpsertSchema = z
  .object({
    brandId: z.string().uuid(),
    yearMonth: yearMonthSchema,
    budgetMajor: z.coerce.number().min(0).max(100_000_000),
    currency: z.string().trim().min(3).max(3).default("GBP"),
    allocationMode: z.enum(AD_BUDGET_ALLOCATION_MODES).default("ai_allocates"),
    platformAllocations: platformAllocationsSchema,
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((val, ctx) => validateAllocationShape(val, ctx));

export const brandBudgetDefaultSchema = z
  .object({
    brandId: z.string().uuid(),
    defaultBudgetMajor: z.coerce
      .number()
      .min(0)
      .max(100_000_000)
      .optional()
      .nullable(),
    currency: z.string().trim().min(3).max(3).default("GBP"),
    allocationMode: z.enum(AD_BUDGET_ALLOCATION_MODES).default("ai_allocates"),
    platformAllocations: platformAllocationsSchema,
  })
  .superRefine((val, ctx) =>
    validateAllocationShape(
      {
        allocationMode: val.allocationMode,
        platformAllocations: val.platformAllocations,
        budgetMajor: val.defaultBudgetMajor,
      },
      ctx,
    ),
  );

type AllocationInput = {
  allocationMode: AdBudgetAllocationMode;
  platformAllocations: PlatformAllocationRow[];
  budgetMajor?: number | null;
};

function validateAllocationShape(
  val: AllocationInput,
  ctx: z.RefinementCtx,
) {
  const rows = val.platformAllocations ?? [];
  const platforms = new Set<string>();
  for (const row of rows) {
    if (platforms.has(row.platform)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate platform allocation for ${row.platform}`,
        path: ["platformAllocations"],
      });
    }
    platforms.add(row.platform);
  }

  if (val.allocationMode === "manual_pct") {
    if (!rows.length) {
      ctx.addIssue({
        code: "custom",
        message: "manual_pct requires at least one platform percent",
        path: ["platformAllocations"],
      });
      return;
    }
    for (const row of rows) {
      if (row.pct == null) {
        ctx.addIssue({
          code: "custom",
          message: `Percent required for ${row.platform}`,
          path: ["platformAllocations"],
        });
      }
    }
    const sum = rows.reduce((s, r) => s + (Number(r.pct) || 0), 0);
    if (Math.abs(sum - 100) > 0.5) {
      ctx.addIssue({
        code: "custom",
        message: `manual_pct allocations must sum to 100% (got ${sum.toFixed(1)}%)`,
        path: ["platformAllocations"],
      });
    }
  }

  if (val.allocationMode === "manual_amount") {
    if (!rows.length) {
      ctx.addIssue({
        code: "custom",
        message: "manual_amount requires at least one platform amount",
        path: ["platformAllocations"],
      });
      return;
    }
    for (const row of rows) {
      if (row.amount_pence == null) {
        ctx.addIssue({
          code: "custom",
          message: `Amount required for ${row.platform}`,
          path: ["platformAllocations"],
        });
      }
    }
    if (val.budgetMajor != null) {
      const potPence = Math.round(val.budgetMajor * 100);
      const sum = rows.reduce((s, r) => s + (r.amount_pence ?? 0), 0);
      if (sum > potPence) {
        ctx.addIssue({
          code: "custom",
          message: `Platform amounts (£${(sum / 100).toFixed(2)}) exceed monthly pot (£${(potPence / 100).toFixed(2)})`,
          path: ["platformAllocations"],
        });
      }
    }
  }
}

/** Pure helper for runtime enforcement (non-Zod callers). */
export function assertAllocationsValid(params: {
  mode: AdBudgetAllocationMode;
  allocations: PlatformAllocationRow[];
  monthlyBudgetPence: number;
}) {
  const parsed = brandBudgetMonthUpsertSchema
    .pick({
      allocationMode: true,
      platformAllocations: true,
      budgetMajor: true,
    })
    .safeParse({
      allocationMode: params.mode,
      platformAllocations: params.allocations,
      budgetMajor: params.monthlyBudgetPence / 100,
    });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid allocations");
  }
}

export function currentYearMonth(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function yearMonthLabel(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m) return yearMonth;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function addMonthsToYearMonth(yearMonth: string, delta: number) {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y!, (m ?? 1) - 1 + delta, 1));
  return currentYearMonth(d);
}

export type ResolvedPlatformShare = {
  platform: AdPlatform;
  monthly_pence: number;
  pct: number;
  locked: boolean;
  source: "manual_pct" | "manual_amount" | "ai" | "even";
};

/**
 * Resolve each platform's share of the monthly pot.
 * Manual pct/amount rows are hard constraints. In ai_allocates mode, locked
 * (or pct/amount-bearing) rows are respected and the remainder is left for AI
 * / even split across unconstrained connected platforms when aiShares omitted.
 */
export function resolvePlatformShares(params: {
  monthlyBudgetPence: number;
  mode: AdBudgetAllocationMode;
  allocations: PlatformAllocationRow[];
  /** Platforms that should receive AI / remainder share (e.g. connected). */
  platforms: AdPlatform[];
  /** Optional AI-proposed pct map (sums to ~100 of unconstrained, or of full pot). */
  aiPctByPlatform?: Partial<Record<AdPlatform, number>>;
}): ResolvedPlatformShare[] {
  const pot = Math.max(0, params.monthlyBudgetPence);
  const platforms = [...new Set(params.platforms)];
  if (!platforms.length || pot === 0) return [];

  const byPlatform = new Map(
    (params.allocations ?? []).map((r) => [r.platform as AdPlatform, r]),
  );

  if (params.mode === "manual_pct") {
    return platforms.map((platform) => {
      const row = byPlatform.get(platform);
      const pct = Number(row?.pct ?? 0);
      return {
        platform,
        pct,
        monthly_pence: Math.round((pot * pct) / 100),
        locked: true,
        source: "manual_pct" as const,
      };
    });
  }

  if (params.mode === "manual_amount") {
    return platforms.map((platform) => {
      const row = byPlatform.get(platform);
      const amount = Math.max(0, row?.amount_pence ?? 0);
      return {
        platform,
        monthly_pence: amount,
        pct: pot > 0 ? (amount / pot) * 100 : 0,
        locked: true,
        source: "manual_amount" as const,
      };
    });
  }

  // ai_allocates — apply hard pins first
  const locked = new Map<AdPlatform, ResolvedPlatformShare>();
  let lockedSum = 0;
  for (const platform of platforms) {
    const row = byPlatform.get(platform);
    if (!row) continue;
    const isLocked =
      row.locked || row.pct != null || row.amount_pence != null;
    if (!isLocked) continue;
    let monthly = 0;
    let pct = 0;
    if (row.amount_pence != null) {
      monthly = Math.max(0, row.amount_pence);
      pct = pot > 0 ? (monthly / pot) * 100 : 0;
    } else if (row.pct != null) {
      pct = Number(row.pct);
      monthly = Math.round((pot * pct) / 100);
    }
    lockedSum += monthly;
    locked.set(platform, {
      platform,
      monthly_pence: monthly,
      pct,
      locked: true,
      source: row.amount_pence != null ? "manual_amount" : "manual_pct",
    });
  }

  const remainder = Math.max(0, pot - lockedSum);
  const free = platforms.filter((p) => !locked.has(p));
  const ai = params.aiPctByPlatform ?? {};
  const aiWeightSum = free.reduce((s, p) => s + (Number(ai[p]) || 0), 0);

  const out: ResolvedPlatformShare[] = [];
  for (const platform of platforms) {
    const pin = locked.get(platform);
    if (pin) {
      out.push(pin);
      continue;
    }
    let monthly = 0;
    let pct = 0;
    if (free.length === 0) {
      monthly = 0;
    } else if (aiWeightSum > 0) {
      const w = Number(ai[platform]) || 0;
      monthly = Math.round((remainder * w) / aiWeightSum);
      pct = pot > 0 ? (monthly / pot) * 100 : 0;
      out.push({
        platform,
        monthly_pence: monthly,
        pct,
        locked: false,
        source: "ai",
      });
      continue;
    } else {
      monthly = Math.round(remainder / free.length);
      pct = pot > 0 ? (monthly / pot) * 100 : 0;
      out.push({
        platform,
        monthly_pence: monthly,
        pct,
        locked: false,
        source: "even",
      });
      continue;
    }
    out.push({
      platform,
      monthly_pence: monthly,
      pct,
      locked: false,
      source: "even",
    });
  }

  // Fix rounding so sum does not exceed pot
  const sum = out.reduce((s, r) => s + r.monthly_pence, 0);
  if (sum > pot && out.length) {
    const scale = pot / sum;
    for (const row of out) {
      row.monthly_pence = Math.max(0, Math.round(row.monthly_pence * scale));
      row.pct = pot > 0 ? (row.monthly_pence / pot) * 100 : 0;
    }
  }
  return out;
}

export function platformDailyCapFromShare(params: {
  monthlySharePence: number;
  flex?: number;
}) {
  const flex = params.flex ?? 0.2;
  const target = Math.round(params.monthlySharePence / 30);
  return {
    target,
    min: Math.round(target * (1 - flex)),
    max: Math.round(target * (1 + flex)),
  };
}
