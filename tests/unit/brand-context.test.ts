import { describe, expect, it } from "vitest";

import { buildBrandContextMarkdown } from "@/lib/brand/markdown";

describe("brand context builder", () => {
  it("includes brand voice and pillars", () => {
    const md = buildBrandContextMarkdown({
      organizationName: "Acme Co",
      brand: {
        name: "Acme",
        website: "https://acme.test",
        positioning: "Practical tools",
        brand_voice: "Clear and confident",
        target_audience: "Operators",
        social_handles: { x: "@acme" },
        guidelines: { tone: "direct" },
      },
      audiences: [
        {
          name: "Ops leads",
          description: "Busy managers",
          messaging_angles: ["save time"],
          channel_behaviour: { linkedin: "high" },
        },
      ],
      competitors: [
        {
          name: "Rival",
          website: "https://rival.test",
          positioning: "Enterprise",
          strengths: ["brand"],
        },
      ],
      pillars: [
        { name: "How-to", target_pct: 40, description: "Education" },
      ],
    });

    expect(md).toContain("Acme Co");
    expect(md).toContain("Clear and confident");
    expect(md).toContain("Ops leads");
    expect(md).toContain("Rival");
    expect(md).toContain("How-to (40%)");
  });

  it("handles empty optional collections", () => {
    const md = buildBrandContextMarkdown({
      organizationName: "Solo",
      brand: {
        name: "Solo",
        website: null,
        positioning: null,
        brand_voice: null,
        target_audience: null,
        social_handles: {},
        guidelines: {},
      },
      audiences: [],
      competitors: [],
      pillars: [],
    });
    expect(md).toContain("None saved yet");
    expect(md).toContain("None configured");
  });
});
