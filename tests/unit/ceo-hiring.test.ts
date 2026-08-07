import { describe, expect, it } from "vitest";
import {
  ALWAYS_ON_AGENT_IDS,
  HIREABLE_AGENT_IDS,
  isHireableAgentId,
} from "@/lib/ceo/hiring";
import { getAgentById } from "@/lib/agents/registry";

describe("CEO hiring registry rules", () => {
  it("only allows real registry ids to be hireable", () => {
    for (const id of HIREABLE_AGENT_IDS) {
      expect(getAgentById(id), id).toBeTruthy();
      expect(isHireableAgentId(id)).toBe(true);
    }
    expect(isHireableAgentId("made-up-agent")).toBe(false);
  });

  it("keeps infrastructure always-on", () => {
    expect(ALWAYS_ON_AGENT_IDS.has("chief-executive")).toBe(true);
    expect(ALWAYS_ON_AGENT_IDS.has("content-cadence-fill")).toBe(true);
    expect(isHireableAgentId("chief-executive")).toBe(false);
  });
});
