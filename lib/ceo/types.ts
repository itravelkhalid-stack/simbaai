import { z } from "zod";

export const CEO_DEPARTMENTS = [
  "content",
  "social",
  "advertising",
  "email",
  "seo",
  "analytics",
  "operations",
] as const;

export type CeoDepartment = (typeof CEO_DEPARTMENTS)[number];

export type CeoDeptStatus = "delivered" | "behind" | "failing" | "idle" | "n/a";

export type CeoFinding = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
};

export type CeoActionTaken = {
  type: string;
  detail: string;
  entity_id?: string | null;
};

export type CeoHireProposal = {
  agent_id: string;
  display_name: string;
  mandate: string;
  reason: string;
  status: "proposed" | "active" | "queued_approval";
};

export type CeoDepartmentResult = {
  department: CeoDepartment;
  status: CeoDeptStatus;
  findings: CeoFinding[];
};

export type CeoCheckSnapshot = {
  departments: CeoDepartmentResult[];
  kpi_summary: {
    week_over_week?: Record<string, number | null>;
    notes?: string[];
  };
  actions_taken: CeoActionTaken[];
  hire_proposals: CeoHireProposal[];
  overall_status: "ok" | "behind" | "failing";
  accountability_markdown: string;
};

export const ceoJudgmentSchema = z.object({
  overall_status: z.enum(["ok", "behind", "failing"]),
  summary: z.string(),
  priorities_today: z.array(z.string()).max(5).default([]),
  human_asks: z.array(z.string()).max(5).default([]),
  growth_note: z.string().optional(),
});

export type CeoJudgment = z.infer<typeof ceoJudgmentSchema>;

export const ceoWeeklySchema = z.object({
  state_of_company_markdown: z.string(),
  growth_vs_last_week: z.string(),
  what_improved: z.array(z.string()).default([]),
  what_ceo_changed: z.array(z.string()).default([]),
  needs_from_human: z.array(z.string()).default([]),
});

export type CeoWeeklyState = z.infer<typeof ceoWeeklySchema>;
