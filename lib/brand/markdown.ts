/**
 * Export pure helpers for unit tests without DB I/O.
 * Production code still uses getBrandContext() in context.ts.
 */
import type {
  Brand,
  BrandAudience,
  BrandProduct,
  Competitor,
} from "@/lib/types/research";
import type { ContentPillar } from "@/lib/types/content";
import type { BrandAssetSlotUrls } from "@/lib/types/media";

export type BrandContextInput = {
  organizationName: string;
  brand: Pick<
    Brand,
    | "name"
    | "website"
    | "positioning"
    | "brand_voice"
    | "target_audience"
    | "social_handles"
    | "guidelines"
    | "tagline"
    | "primary_color"
    | "secondary_color"
    | "accent_color"
    | "font_heading"
    | "font_body"
    | "logo_url"
  >;
  audiences: Array<
    Pick<BrandAudience, "name" | "description" | "messaging_angles" | "channel_behaviour">
  >;
  products?: Array<
    Pick<BrandProduct, "name" | "description" | "category" | "price_pence" | "currency">
  >;
  competitors: Array<
    Pick<Competitor, "name" | "website" | "positioning" | "strengths">
  >;
  pillars: Array<Pick<ContentPillar, "name" | "target_pct" | "description">>;
  assets?: Partial<BrandAssetSlotUrls>;
  guidelinesDigest?: string;
  colorPalette?: string[];
};

export function buildBrandContextMarkdown(ctx: BrandContextInput): string {
  const logoPrimary =
    ctx.assets?.logoPrimary ?? ctx.brand.logo_url ?? "n/a";
  const palette =
    (ctx.colorPalette?.length
      ? ctx.colorPalette
      : [
          ctx.brand.primary_color,
          ctx.brand.secondary_color,
          ctx.brand.accent_color,
        ].filter(Boolean)
    ).join(", ") || "n/a";
  const digest =
    ctx.guidelinesDigest ??
    (typeof (ctx.brand.guidelines as { summary?: string })?.summary === "string"
      ? (ctx.brand.guidelines as { summary: string }).summary
      : null) ??
    "n/a";

  return `
## Brand context (authoritative — follow this)
- Organization: ${ctx.organizationName}
- Brand: ${ctx.brand.name}
- Tagline: ${ctx.brand.tagline ?? "n/a"}
- Website: ${ctx.brand.website ?? "n/a"}
- Positioning: ${ctx.brand.positioning ?? "n/a"}
- Brand voice: ${ctx.brand.brand_voice ?? "n/a"}
- Target audience summary: ${ctx.brand.target_audience ?? "n/a"}
- Color palette: ${palette}
- Fonts: ${[ctx.brand.font_heading, ctx.brand.font_body].filter(Boolean).join(" / ") || "n/a"}
- Logo (primary): ${logoPrimary}
- Logo variants: dark=${ctx.assets?.logoDark ?? "n/a"}; light=${ctx.assets?.logoLight ?? "n/a"}; secondary=${ctx.assets?.logoSecondary ?? "n/a"}
- Guidelines digest: ${digest}
- Social handles: ${JSON.stringify(ctx.brand.social_handles ?? {})}
- Guidelines JSON: ${JSON.stringify(ctx.brand.guidelines ?? {})}

### Personas / audiences
${
  ctx.audiences.length
    ? ctx.audiences
        .map(
          (a) =>
            `- ${a.name}: ${a.description ?? ""} | angles: ${(a.messaging_angles ?? []).join("; ")} | channels: ${JSON.stringify(a.channel_behaviour ?? {})}`,
        )
        .join("\n")
    : "- None saved yet"
}

### Products / offers
${
  (ctx.products ?? []).length
    ? (ctx.products ?? [])
        .map(
          (p) =>
            `- ${p.name}${p.category ? ` [${p.category}]` : ""}: ${p.description ?? ""}${
              p.price_pence != null
                ? ` | ${p.currency} ${(p.price_pence / 100).toFixed(2)}`
                : ""
            }`,
        )
        .join("\n")
    : "- None saved yet"
}

### Known competitors
${
  ctx.competitors.length
    ? ctx.competitors
        .map(
          (c) =>
            `- ${c.name} (${c.website ?? "n/a"}): ${c.positioning ?? ""} | strengths: ${(c.strengths ?? []).join(", ")}`,
        )
        .join("\n")
    : "- None saved yet"
}

### Content pillars
${
  ctx.pillars.length
    ? ctx.pillars
        .map((p) => `- ${p.name} (${p.target_pct}%): ${p.description ?? ""}`)
        .join("\n")
    : "- None configured"
}
`.trim();
}
