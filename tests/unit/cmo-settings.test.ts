import { describe, expect, it } from "vitest";
import { isCmoEnabledForBrandRow, CMO_APPROVAL_LABEL } from "@/lib/cmo/settings";
import { getAgentById } from "@/lib/agents/registry";
import { ALWAYS_ON_AGENT_IDS } from "@/lib/ceo/hiring";

describe("CMO autonomy gate", () => {
  it("is off in approval mode", () => {
    expect(
      isCmoEnabledForBrandRow({
        autonomy_mode: "approval",
        channel_modes: {},
        agent_activity_paused: false,
      }),
    ).toBe(false);
  });

  it("is on when brand autonomy is autonomous", () => {
    expect(
      isCmoEnabledForBrandRow({
        autonomy_mode: "autonomous",
        channel_modes: {},
        agent_activity_paused: false,
      }),
    ).toBe(true);
  });

  it("respects organic channel override", () => {
    expect(
      isCmoEnabledForBrandRow({
        autonomy_mode: "approval",
        channel_modes: { organic_social: "autonomous" },
        agent_activity_paused: false,
      }),
    ).toBe(true);
  });

  it("is off when agent activity paused", () => {
    expect(
      isCmoEnabledForBrandRow({
        autonomy_mode: "autonomous",
        channel_modes: {},
        agent_activity_paused: true,
      }),
    ).toBe(false);
  });

  it("registers CMO as always-on agent", () => {
    expect(getAgentById("chief-marketing-officer")).toBeTruthy();
    expect(ALWAYS_ON_AGENT_IDS.has("chief-marketing-officer")).toBe(true);
    expect(CMO_APPROVAL_LABEL).toContain("CMO");
  });
});
