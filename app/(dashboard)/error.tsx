"use client";

import { ErrorState } from "@/components/brand/error-state";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="This page hit a snag"
      description={error.message || "We couldn't load this view."}
      onRetry={reset}
    />
  );
}
