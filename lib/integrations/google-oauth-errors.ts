/** Human-readable copy for Google OAuth refresh failures (Testing-mode 7-day expiry, revoked grants). */

export function humanizeGoogleOAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid_grant")) {
    return [
      "Google OAuth refresh token expired or revoked.",
      "Your Google Cloud OAuth app is likely in Testing mode (refresh tokens expire after 7 days).",
      "Reconnect GA4/GSC in Data or SEO settings, then submit the app for Google verification so external clients keep long-lived tokens.",
    ].join(" ");
  }
  if (lower.includes("unauthorized_client")) {
    return "Google OAuth client misconfigured — check GOOGLE_CLIENT_ID/SECRET and authorized redirect URIs.";
  }
  if (lower.includes("access_denied")) {
    return "Google access was denied — reconnect and grant all requested scopes.";
  }
  return raw;
}

export function isGoogleTokenExpiredError(raw: string): boolean {
  return /invalid_grant|token has been expired or revoked|unauthorized_client/i.test(
    raw,
  );
}
