import {
  AdsWriteDisabledError,
  adsWritesEnabled,
  type AdsProvider,
  type CreateCampaignResult,
  type DailyMetricRow,
} from "@/lib/ads/providers/types";
import type { AdPlatform } from "@/lib/types/ads";

/** Shared stubs for write ops when platform access isn't approved yet. */
export function createWriteStubs(platform: AdPlatform) {
  return {
    async createCampaign(): Promise<CreateCampaignResult> {
      if (!adsWritesEnabled(platform)) throw new AdsWriteDisabledError(platform);
      throw new Error(`${platform} createCampaign not implemented — see docs/ads-apis.md`);
    },
    async updateBudget(): Promise<void> {
      if (!adsWritesEnabled(platform)) throw new AdsWriteDisabledError(platform);
      throw new Error(`${platform} updateBudget not implemented — see docs/ads-apis.md`);
    },
    async pauseCampaign(): Promise<void> {
      if (!adsWritesEnabled(platform)) throw new AdsWriteDisabledError(platform);
      throw new Error(`${platform} pauseCampaign not implemented — see docs/ads-apis.md`);
    },
    async uploadCreative(): Promise<{ platformCreativeId: string }> {
      if (!adsWritesEnabled(platform)) throw new AdsWriteDisabledError(platform);
      throw new Error(`${platform} uploadCreative not implemented — see docs/ads-apis.md`);
    },
  };
}

/** Empty metrics when the platform can't be queried yet. */
export async function emptyMetrics(): Promise<DailyMetricRow[]> {
  return [];
}

export function assertProviderShape(provider: AdsProvider): AdsProvider {
  return provider;
}
