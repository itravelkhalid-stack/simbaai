import { afterEach, describe, expect, it, vi } from "vitest";

import {
  currencyUnitsToMinor,
  googleAdsSearchStream,
  listAccessibleCustomerIds,
  microsToMinorUnits,
  normalizeGoogleAdsCustomerId,
  refreshGoogleAccessToken,
} from "@/lib/ads/providers/google-ads-api";
import { googleAdsProvider } from "@/lib/ads/providers/google";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  delete process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

describe("google ads money helpers", () => {
  it("converts cost_micros to minor units", () => {
    // £1.00 = 1_000_000 micros → 100 pence
    expect(microsToMinorUnits(1_000_000)).toBe(100);
    expect(microsToMinorUnits("250000")).toBe(25);
    expect(microsToMinorUnits("bad")).toBe(0);
  });

  it("converts conversions_value currency units to minor", () => {
    expect(currencyUnitsToMinor(12.34)).toBe(1234);
    expect(currencyUnitsToMinor("0.5")).toBe(50);
  });

  it("normalizes customer ids", () => {
    expect(normalizeGoogleAdsCustomerId("customers/123-456-7890")).toBe(
      "1234567890",
    );
  });
});

describe("google ads API helpers", () => {
  it("lists accessible customers", async () => {
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            resourceNames: ["customers/111", "customers/222-333-4444"],
          }),
      }),
    );

    const ids = await listAccessibleCustomerIds("access-token");
    expect(ids).toEqual(["111", "2223334444"]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("customers:listAccessibleCustomers"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
          "developer-token": "dev-token",
        }),
      }),
    );
  });

  it("sends login-customer-id on searchStream", async () => {
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token";
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = "999-888-7777";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify([
            {
              results: [
                {
                  segments: { date: "2026-07-01" },
                  metrics: {
                    costMicros: "1000000",
                    impressions: "10",
                    clicks: "2",
                    conversions: 1,
                    conversionsValue: 5.5,
                  },
                },
              ],
            },
          ]),
      }),
    );

    const rows = await googleAdsSearchStream({
      accessToken: "tok",
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
    });

    expect(rows).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "/customers/1234567890/googleAds:searchStream",
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          "login-customer-id": "9998887777",
        }),
      }),
    );
  });

  it("refreshes OAuth access tokens", async () => {
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "csecret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            access_token: "new-access",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/adwords",
          }),
      }),
    );

    const refreshed = await refreshGoogleAccessToken("refresh-me");
    expect(refreshed.accessToken).toBe("new-access");
    expect(refreshed.refreshToken).toBeNull();
    expect(refreshed.expiresAt).toBeInstanceOf(Date);
  });

  it("throws a readable error when Google answers with HTML", async () => {
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => "<!DOCTYPE html><html><body>Not Found</body></html>",
      }),
    );

    await expect(listAccessibleCustomerIds("tok")).rejects.toThrow(
      /non-JSON \(status 404/,
    );
  });
});

describe("googleAdsProvider.fetchDailyMetrics", () => {
  it("maps searchStream rows to DailyMetricRow", async () => {
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "dev-token";
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "csecret";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify([
            {
              results: [
                {
                  campaign: { id: "55" },
                  segments: { date: "2026-07-10" },
                  metrics: {
                    costMicros: "2000000",
                    impressions: "100",
                    clicks: "4",
                    conversions: "2",
                    conversionsValue: 40,
                  },
                },
              ],
            },
          ]),
      }),
    );

    const rows = await googleAdsProvider.fetchDailyMetrics({
      accessToken: "tok",
      accountId: "123-456-7890",
      platformCampaignId: "55",
      since: "2026-07-01",
      until: "2026-07-18",
      metadata: { login_customer_id: "999", currency: "GBP" },
    });

    expect(rows).toEqual([
      expect.objectContaining({
        date: "2026-07-10",
        spendPence: 200,
        impressions: 100,
        clicks: 4,
        conversions: 2,
        revenuePence: 4000,
        currency: "GBP",
      }),
    ]);

    const body = JSON.parse(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(body.query).toContain("metrics.cost_micros");
    expect(body.query).toContain("metrics.conversions_value");
    expect(body.query).toContain("campaign.id = 55");
  });
});
