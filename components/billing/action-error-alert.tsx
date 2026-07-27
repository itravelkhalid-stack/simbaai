"use client";

import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Renders action errors; when upgradeHref is set (plan limits), shows a billing CTA.
 */
export function ActionErrorAlert({
  error,
  upgradeHref,
}: {
  error?: string | null;
  upgradeHref?: string | null;
}) {
  if (!error) return null;

  const href =
    upgradeHref ??
    (error.includes("Upgrade your plan") ? "/finance/billing" : null);

  return (
    <Alert variant="destructive">
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{error}</span>
        {href ? (
          <Link
            href={href}
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface px-2.5 text-[0.8125rem] font-medium text-ink hover:bg-surface-soft"
          >
            View plans & upgrade
          </Link>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
