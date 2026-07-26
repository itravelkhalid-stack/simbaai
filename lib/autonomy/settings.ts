import type { Brand } from "@/lib/types/research";

export type AutonomyMode = "approval" | "autonomous";

export type AutonomyChannel =
  | "ads"
  | "organic_social"
  | "email"
  | "seo"
  | "content";

export type BrandAutonomySettings = {
  autonomyMode: AutonomyMode;
  channelModes: Partial<Record<AutonomyChannel, AutonomyMode>>;
  agentActivityPaused: boolean;
  minRoas: number;
  maxCpaPence: number;
};

const CHANNELS: AutonomyChannel[] = [
  "ads",
  "organic_social",
  "email",
  "seo",
  "content",
];

export function parseChannelModes(raw: unknown): Partial<
  Record<AutonomyChannel, AutonomyMode>
> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Partial<Record<AutonomyChannel, AutonomyMode>> = {};
  for (const channel of CHANNELS) {
    const value = (raw as Record<string, unknown>)[channel];
    if (value === "approval" || value === "autonomous") {
      out[channel] = value;
    }
  }
  return out;
}

export function parseBrandAutonomy(
  brand: Pick<
    Brand,
    | "autonomy_mode"
    | "channel_modes"
    | "agent_activity_paused"
    | "autonomy_min_roas"
    | "autonomy_max_cpa_pence"
  > &
    Partial<Brand>,
): BrandAutonomySettings {
  return {
    autonomyMode: brand.autonomy_mode === "autonomous" ? "autonomous" : "approval",
    channelModes: parseChannelModes(brand.channel_modes),
    agentActivityPaused: Boolean(brand.agent_activity_paused),
    minRoas:
      typeof brand.autonomy_min_roas === "number" && brand.autonomy_min_roas > 0
        ? brand.autonomy_min_roas
        : 1.5,
    maxCpaPence:
      typeof brand.autonomy_max_cpa_pence === "number" &&
      brand.autonomy_max_cpa_pence > 0
        ? brand.autonomy_max_cpa_pence
        : 5000,
  };
}

/** Effective mode for a channel, respecting per-channel override. */
export function effectiveAutonomyMode(
  settings: BrandAutonomySettings,
  channel: AutonomyChannel,
): AutonomyMode {
  return settings.channelModes[channel] ?? settings.autonomyMode;
}

export function isAgentExecutionAllowed(
  settings: BrandAutonomySettings,
  channel: AutonomyChannel,
): boolean {
  if (settings.agentActivityPaused) return false;
  return effectiveAutonomyMode(settings, channel) === "autonomous";
}
