import * as Sentry from "@sentry/nextjs";

/** Log + optionally send to Sentry when a DSN is configured. */
export function reportServerError(
  error: unknown,
  context: {
    scope: string;
    [key: string]: string;
  },
) {
  const { scope, ...rest } = context;
  console.error(`[${scope}]`, error, rest);

  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return;
  }

  Sentry.withScope((sentryScope) => {
    sentryScope.setTag("scope", scope);
    for (const [key, value] of Object.entries(rest)) {
      sentryScope.setTag(key, value);
      sentryScope.setExtra(key, value);
    }
    Sentry.captureException(
      error instanceof Error ? error : new Error(String(error)),
    );
  });
}
