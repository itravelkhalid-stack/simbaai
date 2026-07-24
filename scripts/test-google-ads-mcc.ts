#!/usr/bin/env npx tsx
/**
 * Smoke-test Google Ads against a test MCC / accessible customer.
 *
 * Requires in .env.local (or env):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_ADS_DEVELOPER_TOKEN
 *   GOOGLE_ADS_TEST_REFRESH_TOKEN
 * Optional:
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID  (MCC)
 *   GOOGLE_ADS_TEST_CUSTOMER_ID   (leaf account for metrics)
 *   GOOGLE_ADS_TEST_CAMPAIGN_ID   (campaign for searchStream sample)
 *
 * Usage:
 *   npx tsx scripts/test-google-ads-mcc.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import {
  googleAdsSearchStream,
  listAccessibleCustomerIds,
  refreshGoogleAccessToken,
} from "../lib/ads/providers/google-ads-api";
import { googleAdsProvider } from "../lib/ads/providers/google";

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const i = trimmed.indexOf("=");
      const k = trimmed.slice(0, i);
      let v = trimmed.slice(i + 1);
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    // ignore
  }
}

async function main() {
  loadEnvLocal();

  const required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_ADS_DEVELOPER_TOKEN",
    "GOOGLE_ADS_TEST_REFRESH_TOKEN",
  ] as const;

  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    console.error(
      `Missing env: ${missing.join(", ")}\n` +
        "Connect Google Ads via OAuth once, then set GOOGLE_ADS_TEST_REFRESH_TOKEN to the stored refresh token (or from OAuth consent).",
    );
    process.exit(1);
  }

  console.log("Refreshing access token…");
  const token = await refreshGoogleAccessToken(
    process.env.GOOGLE_ADS_TEST_REFRESH_TOKEN!,
  );
  console.log("Access token OK, expires:", token.expiresAt?.toISOString() ?? "unknown");

  console.log("listAccessibleCustomers…");
  const ids = await listAccessibleCustomerIds(token.accessToken);
  console.log(`Accessible customers (${ids.length}):`, ids);

  console.log("Provider listAccounts…");
  const accounts = await googleAdsProvider.listAccounts({
    accessToken: token.accessToken,
  });
  for (const a of accounts) {
    console.log(
      `  - ${a.accountId} ${a.accountName}` +
        (a.metadata?.manager ? " [manager]" : "") +
        (a.currency ? ` ${a.currency}` : ""),
    );
  }

  const customerId =
    process.env.GOOGLE_ADS_TEST_CUSTOMER_ID?.replace(/-/g, "") ||
    accounts.find((a) => !a.metadata?.manager)?.accountId ||
    ids[0];

  if (!customerId) {
    console.error("No customer id to query");
    process.exit(1);
  }

  console.log(`Customer detail for ${customerId}…`);
  const detail = await googleAdsSearchStream({
    accessToken: token.accessToken,
    customerId,
    query: `
      SELECT
        customer.id,
        customer.descriptive_name,
        customer.currency_code,
        customer.manager
      FROM customer
      LIMIT 1
    `.trim(),
  });
  console.log(JSON.stringify(detail?.[0]?.customer ?? detail, null, 2));

  const campaignId = process.env.GOOGLE_ADS_TEST_CAMPAIGN_ID?.replace(/\D/g, "");
  if (campaignId) {
    const until = new Date();
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    console.log(`fetchDailyMetrics campaign ${campaignId}…`);
    const rows = await googleAdsProvider.fetchDailyMetrics({
      accessToken: token.accessToken,
      accountId: customerId,
      platformCampaignId: campaignId,
      since: iso(since),
      until: iso(until),
      metadata: {
        login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
      },
    });
    console.log(`Metric rows: ${rows.length}`);
    console.log(rows.slice(0, 5));
  } else {
    console.log(
      "Skip metrics (set GOOGLE_ADS_TEST_CAMPAIGN_ID to exercise searchStream reporting).",
    );
  }

  console.log("OK");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
