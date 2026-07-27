import { cn } from "@/lib/utils";
import type { WorkspaceTheme } from "@/lib/brand/theme";

/**
 * Client brand mark for the sidebar — their logo, with Simba as the platform credit.
 */
export function ClientBrandMark({
  theme,
  className,
}: {
  theme: WorkspaceTheme;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-3">
        {theme.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={theme.logoUrl}
            alt=""
            className="size-9 shrink-0 rounded-md bg-surface object-contain ring-1 ring-border"
          />
        ) : (
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-md font-heading text-sm font-bold text-primary-foreground"
            style={{ backgroundColor: theme.primaryColor }}
            aria-hidden
          >
            {theme.brandName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-semibold text-ink">
            {theme.brandName}
          </p>
          <p className="text-[11px] text-ink-soft">powered by Simba AI</p>
        </div>
      </div>
    </div>
  );
}
