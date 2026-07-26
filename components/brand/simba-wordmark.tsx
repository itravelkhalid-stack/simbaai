import Image from "next/image";

import { cn } from "@/lib/utils";

function SmileyMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-7 shrink-0 text-brand", className)}
      aria-hidden
    >
      <rect width="32" height="32" rx="10" fill="currentColor" />
      <circle cx="11.5" cy="13" r="2" fill="var(--sem-surface)" />
      <circle cx="20.5" cy="13" r="2" fill="var(--sem-surface)" />
      <path
        d="M11 19.5c1.4 2 3.2 3 5 3s3.6-1 5-3"
        stroke="var(--sem-surface)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Simba AI wordmark. Pass `src` to swap the placeholder smiley for the real logo.
 */
export function SimbaWordmark({
  src,
  className,
  markClassName,
  showTagline = false,
  size = "md",
}: {
  src?: string;
  className?: string;
  markClassName?: string;
  showTagline?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const titleClass =
    size === "lg"
      ? "text-2xl"
      : size === "sm"
        ? "text-base"
        : "text-lg";
  const markSize = size === "lg" ? 36 : size === "sm" ? 24 : 28;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {src ? (
        <Image
          src={src}
          alt=""
          width={markSize}
          height={markSize}
          className={cn("shrink-0 rounded-[10px]", markClassName)}
        />
      ) : (
        <SmileyMark
          className={cn(
            size === "lg" && "size-9",
            size === "sm" && "size-6",
            markClassName,
          )}
        />
      )}
      <div className="min-w-0">
        <p
          className={cn(
            "font-heading font-bold tracking-tight text-ink",
            titleClass,
          )}
        >
          Simba <span className="text-brand">AI</span>
        </p>
        {showTagline ? (
          <p className="text-sm text-ink-soft">AI Marketing Team</p>
        ) : null}
      </div>
    </div>
  );
}
