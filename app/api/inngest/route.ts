import { serve } from "inngest/next";

import { isInngestFunctionsDisabled } from "@/lib/agents/anthropic";
import { inngest } from "@/lib/inngest/client";
import { brandFunctions } from "@/lib/inngest/functions/brand";
import { contentFunctions } from "@/lib/inngest/functions/content";
import { emailFunctions } from "@/lib/inngest/functions/email";
import { researchFunctions } from "@/lib/inngest/functions/research";
import { socialFunctions } from "@/lib/inngest/functions/social";
import { adsFunctions } from "@/lib/inngest/functions/ads";
import { seoFunctions } from "@/lib/inngest/functions/seo";
import { planningFunctions } from "@/lib/inngest/functions/planning";
import { meetingsFunctions } from "@/lib/inngest/functions/meetings";
import { reviewsFunctions } from "@/lib/inngest/functions/reviews";
import { crmFunctions } from "@/lib/inngest/functions/crm";
import { financeFunctions } from "@/lib/inngest/functions/finance";
import { analyticsFunctions } from "@/lib/inngest/functions/analytics";
import { complianceFunctions } from "@/lib/inngest/functions/compliance";
import { automationsFunctions } from "@/lib/inngest/functions/automations";
import { notificationsFunctions } from "@/lib/inngest/functions/notifications";
import { jobsFunctions } from "@/lib/inngest/functions/jobs";
import { growthFunctions } from "@/lib/inngest/functions/growth";
import { ceoFunctions } from "@/lib/inngest/functions/ceo";
import { cmoFunctions } from "@/lib/cmo/inngest";

const allFunctions = [
  ...researchFunctions,
  ...brandFunctions,
  ...contentFunctions,
  ...socialFunctions,
  ...emailFunctions,
  ...adsFunctions,
  ...seoFunctions,
  ...planningFunctions,
  ...meetingsFunctions,
  ...reviewsFunctions,
  ...crmFunctions,
  ...financeFunctions,
  ...analyticsFunctions,
  ...complianceFunctions,
  ...automationsFunctions,
  ...notificationsFunctions,
  ...jobsFunctions,
  ...growthFunctions,
  ...ceoFunctions,
  ...cmoFunctions,
];

/**
 * Emergency freeze: INNGEST_FUNCTIONS_DISABLED=true or ANTHROPIC_SPEND_KILL_SWITCH=true
 * unregisters every function (including all crons) so Inngest cannot schedule or run them.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: isInngestFunctionsDisabled() ? [] : allFunctions,
});
