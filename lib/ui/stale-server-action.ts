/** Detect Next.js stale Server Action ID errors after a deploy. */
export function isStaleServerActionError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /Server Action ["'`]?[a-f0-9]+["']? was not found on the server|Failed to find Server Action|this request might be from an older or newer deployment/i.test(
    message,
  );
}

export const STALE_SERVER_ACTION_USER_MESSAGE =
  "This page is out of date after a deploy. Reload, then try again.";
