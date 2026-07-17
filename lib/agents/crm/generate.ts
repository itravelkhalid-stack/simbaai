import { runClaudeJson } from "@/lib/agents/claude-json";
import {
  followUpEmailPrompt,
  followUpEmailSchema,
  leadScorePrompt,
  leadScoreSchema,
  pipelineReviewPrompt,
  pipelineReviewSchema,
} from "@/lib/agents/prompts/crm/crm";
import type { BrandContext } from "@/lib/brand/context";
import type { CrmActivity, CrmContact, CrmDeal } from "@/lib/types/crm";

export async function scoreLead(params: {
  brandContext: BrandContext;
  contact: CrmContact;
  activities: CrmActivity[];
  deals: CrmDeal[];
  emailEngagement?: Record<string, number>;
}) {
  return runClaudeJson({
    system: leadScorePrompt.system,
    user: `${params.brandContext.markdown}

## Contact
${JSON.stringify(params.contact, null, 2)}

## Recent activities
${JSON.stringify(params.activities.slice(0, 20), null, 2)}

## Deals
${JSON.stringify(params.deals, null, 2)}

## Email engagement (if any)
${JSON.stringify(params.emailEngagement ?? {}, null, 2)}
`,
    schema: leadScoreSchema,
    maxTokens: 2048,
  });
}

export async function draftFollowUpEmail(params: {
  brandContext: BrandContext;
  contact: CrmContact;
  activities: CrmActivity[];
  deals: CrmDeal[];
}) {
  return runClaudeJson({
    system: followUpEmailPrompt.system,
    user: `${params.brandContext.markdown}

## Contact
${JSON.stringify(
  {
    email: params.contact.email,
    name: params.contact.name,
    company: params.contact.company,
    stage: params.contact.lifecycle_stage,
    score: params.contact.lead_score,
    tags: params.contact.tags,
  },
  null,
  2,
)}

## Deals
${JSON.stringify(params.deals, null, 2)}

## Recent activity
${JSON.stringify(params.activities.slice(0, 10), null, 2)}
`,
    schema: followUpEmailSchema,
    maxTokens: 3000,
  });
}

export async function generatePipelineReview(params: {
  brandContext: BrandContext;
  deals: Array<CrmDeal & { contact_email?: string; contact_name?: string | null; days_in_stage?: number }>;
  weekStart: string;
}) {
  return runClaudeJson({
    system: pipelineReviewPrompt.system,
    user: `${params.brandContext.markdown}

## Week starting ${params.weekStart}

## Open / recent deals
${JSON.stringify(params.deals, null, 2)}
`,
    schema: pipelineReviewSchema,
    maxTokens: 4000,
  });
}
