/**
 * Shared fetch with exponential backoff + per-provider circuit breaker.
 */

export type CircuitState = "closed" | "open" | "half_open";

type Circuit = {
  failures: number;
  openedAt: number | null;
  state: CircuitState;
};

const circuits = new Map<string, Circuit>();

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 60_000;

export class CircuitOpenError extends Error {
  constructor(public provider: string) {
    super(`Circuit open for provider: ${provider}`);
    this.name = "CircuitOpenError";
  }
}

function getCircuit(provider: string): Circuit {
  let c = circuits.get(provider);
  if (!c) {
    c = { failures: 0, openedAt: null, state: "closed" };
    circuits.set(provider, c);
  }
  return c;
}

export function getCircuitState(provider: string): CircuitState {
  const c = getCircuit(provider);
  if (c.state === "open" && c.openedAt) {
    if (Date.now() - c.openedAt >= DEFAULT_COOLDOWN_MS) {
      c.state = "half_open";
    }
  }
  return c.state;
}

export function recordSuccess(provider: string) {
  const c = getCircuit(provider);
  c.failures = 0;
  c.openedAt = null;
  c.state = "closed";
}

export function recordFailure(provider: string) {
  const c = getCircuit(provider);
  c.failures += 1;
  if (c.failures >= DEFAULT_FAILURE_THRESHOLD) {
    c.state = "open";
    c.openedAt = Date.now();
  }
}

/** Reset all circuits (tests). */
export function resetCircuits() {
  circuits.clear();
}

export async function withRetry<T>(params: {
  provider: string;
  fn: () => Promise<T>;
  retries?: number;
  baseDelayMs?: number;
  shouldRetry?: (err: unknown) => boolean;
}): Promise<T> {
  const retries = params.retries ?? 3;
  const baseDelayMs = params.baseDelayMs ?? 400;
  const shouldRetry =
    params.shouldRetry ??
    ((err: unknown) => {
      if (err instanceof CircuitOpenError) return false;
      const msg = err instanceof Error ? err.message : String(err);
      return /429|5\d\d|timeout|ECONNRESET|ENOTFOUND|fetch failed/i.test(msg);
    });

  const state = getCircuitState(params.provider);
  if (state === "open") {
    throw new CircuitOpenError(params.provider);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await params.fn();
      recordSuccess(params.provider);
      return result;
    } catch (err) {
      lastError = err;
      recordFailure(params.provider);
      if (attempt >= retries || !shouldRetry(err)) break;
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

export async function fetchWithRetry(
  provider: string,
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { retries?: number },
): Promise<Response> {
  return withRetry({
    provider,
    retries: options?.retries,
    fn: async () => {
      const res = await fetch(input, init);
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res;
    },
  });
}
