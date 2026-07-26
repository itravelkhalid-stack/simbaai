import { config } from "dotenv";
config({ path: ".env.local" });

import {
  runClaudeJson,
  zodSchemaToToolInputSchema,
} from "../lib/agents/claude-json";
import {
  dailyStandupPrompt,
  standupMeetingSchema,
} from "../lib/agents/prompts/meetings/meetings";

async function main() {
  const schema = zodSchemaToToolInputSchema(standupMeetingSchema);
  console.log("schema type", schema.type);
  console.log("required", (schema as { required?: string[] }).required);
  console.log(
    "props",
    Object.keys((schema as { properties?: object }).properties ?? {}),
  );

  console.log("--- calling Anthropic ---");
  const result = await runClaudeJson({
    system: dailyStandupPrompt.system,
    user: `# Brand
Low Cost Beach

## Cross-module data
No ad spend recorded. No content published. No GA4 data.

Produce a daily standup JSON for brand "Low Cost Beach".`,
    schema: standupMeetingSchema,
    maxTokens: 4096,
  });
  console.log("PASS title=", result.data.title);
  console.log("PASS yesterday len=", result.data.yesterday.length);
  console.log("PASS today len=", result.data.today.length);
  console.log(
    "PASS minutes starts=",
    result.data.minutes_markdown.slice(0, 80).replace(/\n/g, " "),
  );
  console.log(
    "tokens",
    result.tokensIn,
    result.tokensOut,
    "cost_pence",
    result.costPence,
  );
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
