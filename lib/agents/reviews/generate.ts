import { runClaudeJson } from "@/lib/agents/claude-json";
import {
  reportContentSchema,
  reportGeneratorPrompt,
  reportUserPrompt,
} from "@/lib/agents/prompts/reviews/report";
import type { ReportMetricsBundle } from "@/lib/reviews/metrics";
import { deltaPct } from "@/lib/reviews/periods";
import type { ReportContent, ReportType } from "@/lib/types/reviews";

function seedHeadlines(bundle: ReportMetricsBundle) {
  const { current: c, previous: p } = bundle;
  return [
    {
      metric: "ad_spend",
      label: "Ad spend",
      value: Math.round((c.ads.spend_pence / 100) * 100) / 100,
      previous: Math.round((p.ads.spend_pence / 100) * 100) / 100,
      delta_pct: deltaPct(c.ads.spend_pence, p.ads.spend_pence),
      unit: "£",
    },
    {
      metric: "ad_revenue",
      label: "Attributed revenue",
      value: Math.round((c.ads.revenue_pence / 100) * 100) / 100,
      previous: Math.round((p.ads.revenue_pence / 100) * 100) / 100,
      delta_pct: deltaPct(c.ads.revenue_pence, p.ads.revenue_pence),
      unit: "£",
    },
    {
      metric: "roas",
      label: "ROAS",
      value: Math.round(c.ads.roas * 100) / 100,
      previous: Math.round(p.ads.roas * 100) / 100,
      delta_pct: deltaPct(c.ads.roas, p.ads.roas),
      unit: "x",
    },
    {
      metric: "seo_clicks",
      label: "SEO clicks",
      value: c.seo.clicks,
      previous: p.seo.clicks,
      delta_pct: deltaPct(c.seo.clicks, p.seo.clicks),
      unit: "",
    },
    {
      metric: "email_opens",
      label: "Email opens",
      value: c.email.opens,
      previous: p.email.opens,
      delta_pct: deltaPct(c.email.opens, p.email.opens),
      unit: "",
    },
    {
      metric: "content_engagements",
      label: "Content engagements",
      value: c.content.engagements,
      previous: p.content.engagements,
      delta_pct: deltaPct(c.content.engagements, p.content.engagements),
      unit: "",
    },
  ];
}

export async function generateReportContent(
  bundle: ReportMetricsBundle,
  type: ReportType,
): Promise<{
  data: ReportContent;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costPence: number;
}> {
  const includeQuarterly = type === "quarterly";
  const result = await runClaudeJson({
    system: reportGeneratorPrompt.system,
    user: `${bundle.brandMarkdown}

${reportUserPrompt(type, includeQuarterly)}

## Metrics
${bundle.markdown}

## Seed headline numbers (prefer these actuals; you may refine labels/targets)
${JSON.stringify(seedHeadlines(bundle), null, 2)}

## Campaigns raw
${JSON.stringify(bundle.campaigns, null, 2)}

## Plans raw (for quarterly retrospective)
${JSON.stringify(
  bundle.plans.map((p) => ({
    title: p.title,
    period: `${p.period_start}→${p.period_end}`,
    document_summary:
      typeof p.document === "object" && p.document && "summary" in p.document
        ? (p.document as { summary?: string }).summary
        : null,
  })),
  null,
  2,
)}
`,
    schema: reportContentSchema,
    maxTokens: type === "quarterly" || type === "monthly" ? 10000 : 6000,
  });

  const content: ReportContent = {
    ...result.data,
    series: bundle.series,
    branding: {
      primary_color: "#0f766e",
      secondary_color: "#134e4a",
      logo_url: null,
      brand_name: bundle.brandName,
    },
  };

  return {
    data: content,
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costPence: result.costPence,
  };
}
