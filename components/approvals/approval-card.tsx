import { SimbaBadge } from "@/components/brand/ai-content";
import { cn } from "@/lib/utils";

const PLATFORM_DOT: Record<string, string> = {
  instagram: "bg-danger",
  facebook: "bg-brand",
  tiktok: "bg-ink",
  x: "bg-ink-soft",
  linkedin: "bg-primary",
  youtube: "bg-danger",
  pinterest: "bg-warning",
  meta: "bg-brand",
  google: "bg-warning",
  tiktok_ads: "bg-ink",
};

export function PlatformChip({
  label,
  platform,
}: {
  label: string;
  platform: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-ink">
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          PLATFORM_DOT[platform] ?? "bg-brand",
        )}
      />
      {label}
    </span>
  );
}

export function SeverityCallout({
  severity,
  title,
  message,
}: {
  severity: "critical" | "warning" | "info" | string;
  title: string;
  message?: string;
}) {
  const tone =
    severity === "critical"
      ? "bg-danger-soft ring-danger/30 text-danger"
      : severity === "warning"
        ? "bg-warning-soft ring-warning/40 text-ink"
        : "bg-brand-soft ring-brand/20 text-ink";

  return (
    <div className={cn("rounded-md px-3 py-2 text-sm ring-1", tone)}>
      <p className="font-medium">
        <span className="uppercase tracking-wide opacity-80">{severity}</span>
        {" · "}
        {title}
      </p>
      {message ? <p className="mt-0.5 text-ink-soft">{message}</p> : null}
    </div>
  );
}

export function ApprovalCardShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border",
        className,
      )}
    >
      {children}
    </article>
  );
}

export { SimbaBadge };
