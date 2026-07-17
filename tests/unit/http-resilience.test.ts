import { describe, expect, it, beforeEach } from "vitest";

import {
  CircuitOpenError,
  getCircuitState,
  recordFailure,
  resetCircuits,
  withRetry,
} from "@/lib/security/http";

describe("retry + circuit breaker", () => {
  beforeEach(() => resetCircuits());

  it("retries transient failures then succeeds", async () => {
    let attempts = 0;
    const result = await withRetry({
      provider: "test-provider",
      retries: 3,
      baseDelayMs: 1,
      fn: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("HTTP 503");
        return "ok";
      },
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("opens circuit after repeated failures", async () => {
    for (let i = 0; i < 5; i++) {
      recordFailure("flaky");
    }
    expect(getCircuitState("flaky")).toBe("open");
    await expect(
      withRetry({
        provider: "flaky",
        fn: async () => "never",
      }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
  });
});
