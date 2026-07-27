import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ErrorState({
  title = "Something went wrong",
  description,
  retryHref,
  onRetry,
  className,
}: {
  title?: string;
  description: string;
  retryHref?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg bg-danger-soft p-5 ring-1 ring-danger/25",
        className,
      )}
    >
      <p className="font-heading text-base font-semibold text-danger">{title}</p>
      <p className="mt-1 text-sm text-ink">{description}</p>
      {retryHref ? (
        <a href={retryHref} className="mt-4 inline-flex">
          <Button type="button" variant="outline" size="sm">
            Try again
          </Button>
        </a>
      ) : null}
      {onRetry && !retryHref ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onRetry}
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}
