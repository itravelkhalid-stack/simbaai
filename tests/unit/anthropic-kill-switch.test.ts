import { afterEach, describe, expect, it } from "vitest";

import {
  AnthropicSpendKilledError,
  assertAnthropicSpendAllowedEnv,
  createAnthropicClient,
  isInngestFunctionsDisabled,
} from "@/lib/agents/anthropic";

afterEach(() => {
  delete process.env.ANTHROPIC_SPEND_KILL_SWITCH;
  delete process.env.INNGEST_FUNCTIONS_DISABLED;
  delete process.env.ANTHROPIC_API_KEY;
});

describe("Anthropic spend kill switch", () => {
  it("blocks createAnthropicClient when kill switch is on", () => {
    process.env.ANTHROPIC_SPEND_KILL_SWITCH = "true";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(() => createAnthropicClient()).toThrow(AnthropicSpendKilledError);
    expect(() => assertAnthropicSpendAllowedEnv()).toThrow(
      AnthropicSpendKilledError,
    );
    expect(isInngestFunctionsDisabled()).toBe(true);
  });

  it("allows client construction when kill switch is off", () => {
    process.env.ANTHROPIC_SPEND_KILL_SWITCH = "false";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(() => createAnthropicClient()).not.toThrow();
  });
});
