import { readFileSync } from "fs";
import { resolve } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  brandMediaStoragePathFromUrl,
  validateMetaAdImage,
} from "@/lib/ads/meta-image";
import { googleAdsProvider } from "@/lib/ads/providers/google";
import { metaAdsProvider } from "@/lib/ads/providers/meta";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.ADS_WRITES_ENABLED;
  delete process.env.ADS_WRITES_META;
  delete process.env.ADS_WRITES_GOOGLE;
  delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
});

const beachPng = readFileSync(
  resolve(__dirname, "../fixtures/meta-ad-700.png"),
);

const approvedCreatives = [
  {
    localCreativeId: "c1",
    headline: "Beach Deals Today",
    primaryText: "Book your low-cost beach escape today.",
    description: "Great value holidays",
    cta: "LEARN_MORE",
    mediaUrls: ["https://cdn.example.test/beach.jpg"],
  },
  {
    localCreativeId: "c2",
    headline: "Save On Beach Trips",
    primaryText: "ATOL protected packages at low prices.",
    description: "Book your sunshine",
    cta: "LEARN_MORE",
    mediaUrls: [],
  },
  {
    localCreativeId: "c3",
    headline: "Your Sunny Escape",
    primaryText: "Find a package that fits your budget.",
    description: "Browse beach offers",
    cta: "LEARN_MORE",
    mediaUrls: [],
  },
];

describe("Meta ad image helpers", () => {
  it("parses brand-media public and signed URLs", () => {
    expect(
      brandMediaStoragePathFromUrl(
        "https://xyz.supabase.co/storage/v1/object/public/brand-media/org/brand/file.png",
      ),
    ).toBe("org/brand/file.png");
    expect(
      brandMediaStoragePathFromUrl(
        "https://xyz.supabase.co/storage/v1/object/sign/brand-media/org/brand/file.png?token=abc",
      ),
    ).toBe("org/brand/file.png");
    expect(
      brandMediaStoragePathFromUrl("https://cdn.example.test/beach.jpg"),
    ).toBeNull();
  });

  it("validates Meta image minimums without sharp", () => {
    const ok = validateMetaAdImage(beachPng);
    expect(ok.width).toBe(700);
    expect(ok.height).toBe(700);
    expect(ok.mimeType).toBe("image/png");
  });
});

describe("Meta Ads writes", () => {
  it("fails closed when writes are disabled", async () => {
    await expect(
      metaAdsProvider.createCampaign({
        accessToken: "token",
        accountId: "act_123",
        name: "Test",
        dailyBudgetPence: 100,
        finalUrl: "https://example.test",
        creatives: approvedCreatives,
        metadata: { page_id: "page_1" },
      }),
    ).rejects.toThrow(/disabled/i);
  });

  it("creates campaign, ad set, creative and ad PAUSED", async () => {
    process.env.ADS_WRITES_ENABLED = "true";
    const writes: Array<{ url: string; body: FormData | URLSearchParams }> = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://cdn.example.test/beach.jpg") {
          return new Response(beachPng, {
            status: 200,
            headers: { "content-type": "image/png" },
          });
        }
        const body = init?.body as FormData | URLSearchParams;
        writes.push({ url, body });
        if (url.endsWith("/campaigns")) {
          return Response.json({ id: "campaign_1" });
        }
        if (url.endsWith("/adsets")) return Response.json({ id: "adset_1" });
        if (url.endsWith("/adimages")) {
          expect(body).toBeInstanceOf(FormData);
          return Response.json({ images: { upload: { hash: "hash_1" } } });
        }
        if (url.endsWith("/adcreatives")) {
          return Response.json({ id: "creative_1" });
        }
        if (url.endsWith("/ads")) return Response.json({ id: "ad_1" });
        throw new Error(`Unexpected request ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await metaAdsProvider.createCampaign({
      accessToken: "token",
      accountId: "123",
      name: "Test campaign",
      objective: "traffic",
      dailyBudgetPence: 100,
      currency: "GBP",
      targeting: { countries: ["GB"] },
      finalUrl: "https://example.test/offer",
      creatives: approvedCreatives,
      metadata: { page_id: "page_1", ig_user_id: "ig_1" },
    });

    expect(result).toMatchObject({
      platformCampaignId: "campaign_1",
      platformAdSetId: "adset_1",
      platformAdId: "ad_1",
      status: "PAUSED",
    });
    const campaignsBody = writes.find((row) => row.url.endsWith("/campaigns"))
      ?.body as URLSearchParams;
    const adsetsBody = writes.find((row) => row.url.endsWith("/adsets"))
      ?.body as URLSearchParams;
    const adsBody = writes.find((row) => row.url.endsWith("/ads"))
      ?.body as URLSearchParams;
    expect(campaignsBody.get("status")).toBe("PAUSED");
    expect(adsetsBody.get("status")).toBe("PAUSED");
    expect(adsBody.get("status")).toBe("PAUSED");
    expect(adsetsBody.get("daily_budget")).toBe("100");
  });

  it("posts the full targeting spec from the approved brief, not geo-only", async () => {
    process.env.ADS_WRITES_ENABLED = "true";
    const writes: Array<{ url: string; body: FormData | URLSearchParams }> = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "https://cdn.example.test/beach.jpg") {
          return new Response(beachPng, {
            status: 200,
            headers: { "content-type": "image/png" },
          });
        }
        if (url.includes("/search") && url.includes("type=adinterest")) {
          const q = new URL(url).searchParams.get("q") ?? "interest";
          return Response.json({ data: [{ id: `int_${q}`, name: q }] });
        }
        const body = init?.body as FormData | URLSearchParams;
        writes.push({ url, body });
        if (url.endsWith("/campaigns")) {
          return Response.json({ id: "campaign_1" });
        }
        if (url.endsWith("/adsets")) return Response.json({ id: "adset_1" });
        if (url.endsWith("/adimages")) {
          return Response.json({ images: { upload: { hash: "hash_1" } } });
        }
        if (url.endsWith("/adcreatives")) {
          return Response.json({ id: "creative_1" });
        }
        if (url.endsWith("/ads")) return Response.json({ id: "ad_1" });
        throw new Error(`Unexpected request ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await metaAdsProvider.createCampaign({
      accessToken: "token",
      accountId: "123",
      name: "Test campaign",
      objective: "traffic",
      dailyBudgetPence: 100,
      currency: "GBP",
      targeting: {
        countries: ["GB"],
        notes:
          "Advantage+ Audience with interest guardrails. UK only. Placements Instagram Feed, Instagram Reels, Facebook Feed. Age 25–54.",
        audience:
          "UK 25–54; interests: luxury travel, Dubai, UAE travel, resort holidays, beach holidays, international travel, holiday deals",
      },
      finalUrl: "https://example.test/offer",
      creatives: approvedCreatives,
      metadata: { page_id: "page_1", ig_user_id: "ig_1" },
    });

    const adsetsBody = writes.find((row) => row.url.endsWith("/adsets"))
      ?.body as URLSearchParams;
    const targeting = JSON.parse(adsetsBody.get("targeting") ?? "{}") as {
      age_min?: number;
      age_max?: number;
      geo_locations?: { countries?: string[] };
      flexible_spec?: Array<{ interests: Array<{ name: string }> }>;
      facebook_positions?: string[];
      instagram_positions?: string[];
    };
    expect(targeting.geo_locations?.countries).toEqual(["GB"]);
    expect(targeting.age_min).toBe(25);
    expect(targeting.age_max).toBe(54);
    expect(targeting.facebook_positions).toEqual(["feed"]);
    expect(targeting.instagram_positions).toEqual(["stream", "reels"]);
    expect(
      targeting.flexible_spec?.[0]?.interests.map((row) => row.name),
    ).toEqual(
      expect.arrayContaining(["luxury travel", "Dubai", "holiday deals"]),
    );
  });

  it("surfaces full Meta adimages error payload", async () => {
    process.env.ADS_WRITES_ENABLED = "true";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://cdn.example.test/beach.jpg") {
        return new Response(beachPng, {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      }
      if (url.endsWith("/campaigns")) {
        return Response.json({ id: "campaign_1" });
      }
      if (url.endsWith("/adsets")) return Response.json({ id: "adset_1" });
      if (url.endsWith("/adimages")) {
        return Response.json(
          {
            error: {
              message: "Invalid parameter",
              type: "OAuthException",
              code: 100,
              error_user_msg: "Your image is too small.",
              fbtrace_id: "TRACE123",
            },
          },
          { status: 400 },
        );
      }
      if (url.match(/\/campaign_1$/)) {
        return Response.json({ success: true });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      metaAdsProvider.createCampaign({
        accessToken: "token",
        accountId: "123",
        name: "Test campaign",
        dailyBudgetPence: 100,
        finalUrl: "https://example.test/offer",
        creatives: approvedCreatives,
        metadata: { page_id: "page_1" },
      }),
    ).rejects.toThrow(/Your image is too small[\s\S]*fbtrace_id=TRACE123/);
  });
});

describe("Google Ads writes", () => {
  it("creates an atomic paused Search hierarchy", async () => {
    process.env.ADS_WRITES_ENABLED = "true";
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        mutateOperations: Array<Record<string, Record<string, unknown>>>;
      };
      const campaignCreate = body.mutateOperations.find(
        (operation) => operation.campaignOperation,
      )?.campaignOperation.create as { status?: string };
      const adGroupCreate = body.mutateOperations.find(
        (operation) => operation.adGroupOperation,
      )?.adGroupOperation.create as { status?: string };
      const adCreate = body.mutateOperations.find(
        (operation) => operation.adGroupAdOperation,
      )?.adGroupAdOperation.create as { status?: string };
      expect(campaignCreate.status).toBe("PAUSED");
      expect(adGroupCreate.status).toBe("PAUSED");
      expect(adCreate.status).toBe("PAUSED");
      expect(
        body.mutateOperations.some((operation) =>
          Boolean(operation.campaignCriterionOperation),
        ),
      ).toBe(true);
      return Response.json({
        mutateOperationResponses: [
          {
            campaignBudgetResult: {
              resourceName: "customers/123/campaignBudgets/10",
            },
          },
          {
            campaignResult: { resourceName: "customers/123/campaigns/20" },
          },
          {
            campaignCriterionResult: {
              resourceName: "customers/123/campaignCriteria/20~2826",
            },
          },
          {
            adGroupResult: { resourceName: "customers/123/adGroups/30" },
          },
          {
            adGroupAdResult: {
              resourceName: "customers/123/adGroupAds/30~40",
            },
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await googleAdsProvider.createCampaign({
      accessToken: "token",
      accountId: "123",
      name: "Search test",
      objective: "traffic",
      dailyBudgetPence: 100,
      currency: "GBP",
      targeting: { countries: ["GB"] },
      finalUrl: "https://example.test/offer",
      creatives: approvedCreatives,
      metadata: { login_customer_id: "999" },
    });

    expect(result).toMatchObject({
      platformCampaignId: "20",
      platformBudgetId: "10",
      platformAdSetId: "30",
      platformAdId: "30~40",
      status: "PAUSED",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
