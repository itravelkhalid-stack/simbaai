import { SmileyMark, SimbaWordmark } from "@/components/brand/simba-wordmark";

/**
 * Auth front door — split layout: form column + teal Simba brand panel.
 */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-md space-y-8">
          <div className="lg:hidden">
            <SimbaWordmark size="lg" showTagline />
          </div>
          <div className="space-y-2">
            <h1 className="font-heading text-3xl font-bold tracking-tight text-ink">
              {title}
            </h1>
            <p className="text-sm text-ink-soft">{description}</p>
          </div>
          {children}
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 size-72 rounded-full bg-brand/30"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-10 size-80 rounded-full bg-brand-soft/20"
        />
        <div className="relative flex items-center gap-3">
          <SmileyMark className="size-10 text-brand" />
          <div>
            <p className="font-heading text-2xl font-bold tracking-tight text-primary-foreground">
              Simba <span className="text-highlight">AI</span>
            </p>
            <p className="text-sm text-primary-foreground/70">
              AI Marketing Team
            </p>
          </div>
        </div>
        <div className="relative space-y-4">
          <p className="max-w-sm font-heading text-3xl font-bold leading-tight text-primary-foreground">
            Your AI marketing team, always on.
          </p>
          <p className="max-w-sm text-sm leading-relaxed text-primary-foreground/80">
            Research, content, ads, and ops — branded for every client you
            serve.
          </p>
        </div>
        <p className="relative text-xs text-primary-foreground/60">
          Client brand on every report · Simba chrome underneath
        </p>
      </aside>
    </div>
  );
}
