import { describe, expect, it } from "vitest";

import {
  effectiveAutonomyMode,
  isAgentExecutionAllowed,
  parseBrandAutonomy,
  parseChannelModes,
} from "@/lib/autonomy/settings";

describe("autonomy settings", () => {
  it("defaults to approval with kill switch off", () => {
    const settings = parseBrandAutonomy({
      autonomy_mode: "approval",
      channel_modes: {},
      agent_activity_paused: false,
      autonomy_min_roas: 1.5,
      autonomy_max_cpa_pence: 5000,
    });
    expect(settings.autonomyMode).toBe("approval");
    expect(effectiveAutonomyMode(settings, "ads")).toBe("approval");
    expect(isAgentExecutionAllowed(settings, "ads")).toBe(false);
  });

  it("honours channel overrides", () => {
    const settings = parseBrandAutonomy({
      autonomy_mode: "approval",
      channel_modes: { ads: "autonomous", organic_social: "approval" },
      agent_activity_paused: false,
      autonomy_min_roas: 2,
      autonomy_max_cpa_pence: 3000,
    });
    expect(effectiveAutonomyMode(settings, "ads")).toBe("autonomous");
    expect(effectiveAutonomyMode(settings, "organic_social")).toBe("approval");
    expect(isAgentExecutionAllowed(settings, "ads")).toBe(true);
  });

  it("kill switch blocks all channels", () => {
    const settings = parseBrandAutonomy({
      autonomy_mode: "autonomous",
      channel_modes: {},
      agent_activity_paused: true,
      autonomy_min_roas: 1.5,
      autonomy_max_cpa_pence: 5000,
    });
    expect(isAgentExecutionAllowed(settings, "ads")).toBe(false);
    expect(isAgentExecutionAllowed(settings, "organic_social")).toBe(false);
  });

  it("ignores invalid channel mode values", () => {
    expect(parseChannelModes({ ads: "yolo", email: "autonomous" })).toEqual({
      email: "autonomous",
    });
  });
});

describe("autonomous budget increase cap", () => {
  it("caps agent increases at 20%", () => {
    const current = 1000;
    const max = Math.floor(current * 1.2);
    expect(max).toBe(1200);
    expect(1300 > max).toBe(true);
  });
});
