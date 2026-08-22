/**
 * Single choke point for every Claude / Anthropic Messages API call.
 * When ANTHROPIC_SPEND_KILL_SWITCH=true (or org settings.anthropic_spend_paused),
 * no request leaves this process.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";

export class AnthropicSpendKilledError extends Error {
  constructor(detail: string) {
    super(`Anthropic spend kill switch is ON — ${detail}`);
    this.name = "AnthropicSpendKilledError";
  }
}

export function isAnthropicSpendKillSwitchEnvOn(): boolean {
  return process.env.ANTHROPIC_SPEND_KILL_SWITCH === "true";
}

export function isInngestFunctionsDisabled(): boolean {
  return (
    process.env.INNGEST_FUNCTIONS_DISABLED === "true" ||
    isAnthropicSpendKillSwitchEnvOn()
  );
}

/** Env-level hard stop (no org context required). */
export function assertAnthropicSpendAllowedEnv(): void {
  if (isAnthropicSpendKillSwitchEnvOn()) {
    throw new AnthropicSpendKilledError(
      "ANTHROPIC_SPEND_KILL_SWITCH=true (global freeze)",
    );
  }
}

/**
 * Org-level stop via organizations.settings.anthropic_spend_paused.
 * Call when organizationId is known; env kill still applies first.
 */
export async function assertAnthropicSpendAllowedForOrg(
  organizationId: string,
): Promise<void> {
  assertAnthropicSpendAllowedEnv();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const paused = Boolean(
    (data?.settings as { anthropic_spend_paused?: boolean } | null)
      ?.anthropic_spend_paused,
  );
  if (paused) {
    throw new AnthropicSpendKilledError(
      `organization ${organizationId} settings.anthropic_spend_paused=true`,
    );
  }
}

/**
 * The only place that constructs Anthropic for Messages API usage.
 * All modules must call this — never `new Anthropic(...)` elsewhere.
 */
export function createAnthropicClient(params?: {
  apiKey?: string;
}): Anthropic {
  assertAnthropicSpendAllowedEnv();
  const apiKey = params?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const base = new Anthropic({ apiKey });
  const create = base.messages.create.bind(base.messages);

  base.messages.create = ((
    body: Parameters<typeof create>[0],
    options?: Parameters<typeof create>[1],
  ) => {
    assertAnthropicSpendAllowedEnv();
    return create(body, options);
  }) as typeof base.messages.create;

  return base;
}
