import { cn } from "@/lib/utils";

/** Small mark that flags agent-generated content. */
export function SimbaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-primary",
        className,
      )}
    >
      <span aria-hidden>✦</span>
      Simba
    </span>
  );
}

/** Surface for AI-generated drafts, minutes, recommendations. */
export function AiContentSurface({
  children,
  className,
  tone = "highlight",
  showBadge = true,
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "highlight" | "accent";
  showBadge?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative rounded-lg p-5",
        tone === "highlight" ? "bg-highlight" : "bg-brand-soft",
        className,
      )}
    >
      {showBadge ? (
        <div className="mb-3">
          <SimbaBadge />
        </div>
      ) : null}
      {children}
    </div>
  );
}
