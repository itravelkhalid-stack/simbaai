import { describe, expect, it } from "vitest";

import { buildBrandContextMarkdown } from "@/lib/brand/markdown";

describe("brand context builder", () => {
  it("includes brand voice and pillars", () => {
    const md = buildBrandContextMarkdown({
      organizationName: "Acme Co",
      brand: {
        name: "Acme",
        website: "https://acme.test",
        allowed_link_urls: ["https://acme.test/terms"],
        positioning: "Practical tools",
        brand_voice: "Clear and confident",
        target_audience: "Operators",
        social_handles: { x: "@acme" },
        guidelines: { tone: "direct" },
        tagline: "Ship faster",
        primary_color: "#0F172A",
        secondary_color: null,
        accent_color: null,
        font_heading: "Fraunces",
        font_body: "Source Sans 3",
        logo_url: null,
      },
      audiences: [
        {
          name: "Ops leads",
          description: "Busy managers",
          messaging_angles: ["save time"],
          channel_behaviour: { linkedin: "high" },
        },
      ],
      products: [
        {
          name: "Starter",
          description: "Entry plan",
          category: "saas",
          price_pence: 2900,
          currency: "GBP",
          url: "https://acme.test/starter",
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
    expect(md).toContain("Guidelines digest:");
    expect(md).toContain("## Allowed links");
    expect(md).toContain("https://acme.test/terms");
    expect(md).toContain("https://acme.test/starter");
  });

  it("includes logo URLs and color palette when provided", () => {
    const md = buildBrandContextMarkdown({
      organizationName: "Acme Co",
      brand: {
        name: "Acme",
        website: null,
        allowed_link_urls: [],
        positioning: null,
        brand_voice: null,
        target_audience: null,
        social_handles: {},
        guidelines: { summary: "Be clear and warm" },
        tagline: null,
        primary_color: "#111111",
        secondary_color: "#222222",
        accent_color: null,
        font_heading: null,
        font_body: null,
        logo_url: "https://cdn.test/legacy.png",
      },
      audiences: [],
      competitors: [],
      pillars: [],
      assets: {
        logoPrimary: "https://cdn.test/primary.png",
        logoDark: "https://cdn.test/dark.png",
        logoLight: null,
        logoSecondary: null,
        guidelinesDoc: "https://cdn.test/guide.pdf",
      },
      guidelinesDigest: "Be clear and warm",
      colorPalette: ["#111111", "#222222"],
    });

    expect(md).toContain("https://cdn.test/primary.png");
    expect(md).toContain("dark=https://cdn.test/dark.png");
    expect(md).toContain("Color palette: #111111, #222222");
    expect(md).toContain("Be clear and warm");
  });

  it("handles empty optional collections", () => {
    const md = buildBrandContextMarkdown({
      organizationName: "Solo",
      brand: {
        name: "Solo",
        website: null,
        allowed_link_urls: [],
        positioning: null,
        brand_voice: null,
        target_audience: null,
        social_handles: {},
        guidelines: {},
        tagline: null,
        primary_color: null,
        secondary_color: null,
        accent_color: null,
        font_heading: null,
        font_body: null,
        logo_url: null,
      },
      audiences: [],
      products: [],
      competitors: [],
      pillars: [],
    });
    expect(md).toContain("## Approved claims");
    expect(md).toContain("None configured");
  });
});
