import { describe, expect, it } from "vitest";

import { BRAND_AGENT_HALT_MESSAGE } from "@/lib/brand/agent-halt";

describe("brand agent halt", () => {
  it("halt message mentions kill switch and Claude spend", () => {
    expect(BRAND_AGENT_HALT_MESSAGE).toContain("kill switch");
    expect(BRAND_AGENT_HALT_MESSAGE).toContain("Claude");
  });
});
