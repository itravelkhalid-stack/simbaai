import { describe, expect, it } from "vitest";

import { toolResultFollowUp } from "@/lib/agents/claude-json";
import { shouldParkForBrandFit } from "@/lib/cmo/severity";

describe("shouldParkForBrandFit (organic severity)", () => {
  it("does not park WARN/PASS when brand_fit is acceptable or strong", () => {
    expect(
      shouldParkForBrandFit({
        decision: { decision: "park", brand_fit: "acceptable" },
        complianceStatus: "warn",
      }),
    ).toBe(false);
    expect(
      shouldParkForBrandFit({
        decision: { decision: "park", brand_fit: "strong" },
        complianceStatus: "pass",
      }),
    ).toBe(false);
  });

  it("parks when brand_fit is poor even if compliance is warn", () => {
    expect(
      shouldParkForBrandFit({
        decision: { decision: "park", brand_fit: "poor" },
        complianceStatus: "warn",
      }),
    ).toBe(true);
  });

  it("approves when decision is approve", () => {
    expect(
      shouldParkForBrandFit({
        decision: { decision: "approve", brand_fit: "acceptable" },
        complianceStatus: "warn",
      }),
    ).toBe(false);
  });
});

describe("toolResultFollowUp", () => {
  it("pairs tool_use with tool_result blocks", () => {
    const assistant = [
      {
        type: "tool_use" as const,
        id: "toolu_abc",
        name: "emit_structured_result",
        input: { decision: "approve" },
      },
    ];
    const messages = toolResultFollowUp(assistant, "retry please");
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("assistant");
    expect(messages[1].role).toBe("user");
    const content = messages[1].content;
    expect(Array.isArray(content)).toBe(true);
    if (Array.isArray(content)) {
      expect(content[0]).toMatchObject({
        type: "tool_result",
        tool_use_id: "toolu_abc",
        is_error: true,
      });
    }
  });

  it("falls back to plain text when no tool_use", () => {
    const messages = toolResultFollowUp(
      [{ type: "text", text: "hello" } as never],
      "continue",
    );
    expect(messages[1]).toEqual({ role: "user", content: "continue" });
  });
});
