import { cn } from "@/lib/utils";

/** Shared classes for native form controls that must submit via FormData. */
export const fieldSelectClass = cn(
  "flex h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-ink",
  "outline-none transition-colors",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export const fieldInputClass = cn(
  "flex h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink",
  "outline-none transition-colors placeholder:text-ink-soft",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

export const fieldCheckboxClass = cn(
  "size-4 rounded border-border text-primary accent-[var(--sem-primary)]",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
);
