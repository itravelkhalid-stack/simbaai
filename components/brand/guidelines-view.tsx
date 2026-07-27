"use client";

import { useActionState } from "react";

import { EmptyState } from "@/components/brand/empty-state";
import {
  saveGuidelinesNotes,
  type BrandActionResult,
} from "@/lib/brand/actions";
import type { Brand, BrandAudience, BrandProduct } from "@/lib/types/research";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: BrandActionResult = {};

function lines(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        {eyebrow ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-heading text-xl font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function BrandGuidelinesView({
  brand,
  audiences,
  products,
}: {
  brand: Brand;
  audiences: BrandAudience[];
  products: BrandProduct[];
}) {
  const g = (brand.guidelines ?? {}) as Record<string, unknown>;
  const [state, action, pending] = useActionState(saveGuidelinesNotes, initial);

  const palette = [
    { label: "Primary", hex: brand.primary_color },
    { label: "Secondary", hex: brand.secondary_color },
    { label: "Accent", hex: brand.accent_color },
  ].filter((c) => Boolean(c.hex)) as Array<{ label: string; hex: string }>;

  const doSay = lines(g.do_say);
  const dontSay = lines(g.dont_say);
  const hero = brand.primary_color || "var(--sem-accent)";
  const wash = brand.secondary_color || brand.accent_color || "var(--sem-accent-soft)";

  return (
    <div className="space-y-10">
      {/* Hero — client's brand on display */}
      <div
        className="relative overflow-hidden rounded-lg shadow-elevated ring-1 ring-border"
        style={{
          background: `linear-gradient(135deg, ${hero} 0%, ${wash} 55%, var(--surface) 100%)`,
        }}
      >
        <div className="absolute inset-0 bg-surface/55 backdrop-blur-[2px]" />
        <div className="relative flex flex-col gap-6 p-8 md:flex-row md:items-end md:justify-between md:p-10">
          <div className="space-y-4">
            {brand.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logo_url}
                alt={`${brand.name} logo`}
                className="h-14 w-auto max-w-[220px] object-contain drop-shadow-sm"
              />
            ) : (
              <p
                className="font-heading text-4xl font-bold tracking-tight md:text-5xl"
                style={{ color: brand.primary_color || undefined }}
              >
                {brand.name}
              </p>
            )}
            {brand.tagline ? (
              <p className="max-w-xl font-heading text-xl font-medium text-ink md:text-2xl">
                {brand.tagline}
              </p>
            ) : null}
            {brand.positioning ? (
              <p className="max-w-[65ch] text-sm leading-relaxed text-ink-soft md:text-base">
                {brand.positioning}
              </p>
            ) : null}
          </div>
          {palette.length > 0 ? (
            <div className="flex gap-2">
              {palette.map((c) => (
                <div
                  key={c.hex}
                  className="size-12 rounded-md shadow-elevated ring-1 ring-border"
                  style={{ backgroundColor: c.hex }}
                  title={`${c.label} ${c.hex}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <Section eyebrow="Voice" title="How we sound">
        {brand.brand_voice ? (
          <div className="max-w-[65ch] rounded-lg bg-highlight p-6">
            <p className="whitespace-pre-wrap text-base leading-relaxed text-ink">
              {brand.brand_voice}
            </p>
          </div>
        ) : (
          <EmptyState
            title="Voice not set yet"
            description="Define how this brand speaks so Simba drafts sound like you — not generic marketing."
            actionLabel="Edit in wizard"
            actionHref={`/brand/setup?brandId=${brand.id}`}
            className="py-10"
          />
        )}
      </Section>

      <Section eyebrow="Palette" title="Colours">
        {palette.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {palette.map((c) => (
              <div
                key={c.hex}
                className="overflow-hidden rounded-lg bg-card shadow-elevated ring-1 ring-border"
              >
                <div className="h-28" style={{ backgroundColor: c.hex }} />
                <div className="space-y-0.5 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">
                    {c.label}
                  </p>
                  <p className="font-heading text-lg font-semibold tabular-nums text-ink">
                    {c.hex}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">No colours saved yet.</p>
        )}
      </Section>

      <Section eyebrow="Typography" title="Type">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-card p-6 shadow-elevated ring-1 ring-border">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">
              Heading
            </p>
            <p
              className="mt-3 text-3xl font-bold tracking-tight text-ink"
              style={{
                fontFamily: brand.font_heading
                  ? `"${brand.font_heading}", sans-serif`
                  : undefined,
              }}
            >
              {brand.font_heading || "Not set"}
            </p>
            <p
              className="mt-2 text-sm text-ink-soft"
              style={{
                fontFamily: brand.font_heading
                  ? `"${brand.font_heading}", sans-serif`
                  : undefined,
              }}
            >
              The quick brown fox jumps over the lazy dog
            </p>
          </div>
          <div className="rounded-lg bg-card p-6 shadow-elevated ring-1 ring-border">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">
              Body
            </p>
            <p
              className="mt-3 text-3xl font-semibold tracking-tight text-ink"
              style={{
                fontFamily: brand.font_body
                  ? `"${brand.font_body}", sans-serif`
                  : undefined,
              }}
            >
              {brand.font_body || "Not set"}
            </p>
            <p
              className="mt-2 text-sm leading-relaxed text-ink-soft"
              style={{
                fontFamily: brand.font_body
                  ? `"${brand.font_body}", sans-serif`
                  : undefined,
              }}
            >
              Clear body copy keeps campaigns readable across email, ads, and
              social.
            </p>
          </div>
        </div>
      </Section>

      <Section eyebrow="Guardrails" title="Do & don&apos;t">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-success-soft p-5 ring-1 ring-success/30">
            <p className="font-heading text-sm font-semibold text-ink">Do say</p>
            <ul className="mt-3 space-y-2 text-sm text-ink">
              {doSay.length ? (
                doSay.map((x) => (
                  <li key={x} className="flex gap-2">
                    <span className="text-success" aria-hidden>
                      ✓
                    </span>
                    <span>{x}</span>
                  </li>
                ))
              ) : (
                <li className="text-ink-soft">None yet</li>
              )}
            </ul>
          </div>
          <div className="rounded-lg bg-danger-soft p-5 ring-1 ring-danger/25">
            <p className="font-heading text-sm font-semibold text-ink">
              Don&apos;t say
            </p>
            <ul className="mt-3 space-y-2 text-sm text-ink">
              {dontSay.length ? (
                dontSay.map((x) => (
                  <li key={x} className="flex gap-2">
                    <span className="text-danger" aria-hidden>
                      ✕
                    </span>
                    <span>{x}</span>
                  </li>
                ))
              ) : (
                <li className="text-ink-soft">None yet</li>
              )}
            </ul>
          </div>
        </div>
      </Section>

      <Section eyebrow="People" title="Audiences">
        {audiences.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {audiences.map((a) => (
              <article
                key={a.id}
                className="rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border"
              >
                <h3 className="font-heading text-base font-semibold text-ink">
                  {a.name}
                </h3>
                {a.description ? (
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    {a.description}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No audiences yet"
            description="Add who you sell to so research, content, and ads stay on target."
            actionLabel="Add audiences"
            actionHref={`/brand/setup?brandId=${brand.id}`}
            className="py-10"
          />
        )}
      </Section>

      <Section eyebrow="Offer" title="Products">
        {products.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {products.map((p) => (
              <article
                key={p.id}
                className="rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border"
              >
                <h3 className="font-heading text-base font-semibold text-ink">
                  {p.name}
                </h3>
                {p.category ? (
                  <p className="mt-1 text-xs uppercase tracking-wide text-ink-soft">
                    {p.category}
                  </p>
                ) : null}
                {p.description ? (
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                    {p.description}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No products yet"
            description="List what you sell so agents can write accurate offers and landing copy."
            actionLabel="Add products"
            actionHref={`/brand/setup?brandId=${brand.id}`}
            className="py-10"
          />
        )}
      </Section>

      <form
        action={action}
        className="space-y-4 rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border"
      >
        <input type="hidden" name="brandId" value={brand.id} />
        <h2 className="font-heading text-lg font-semibold text-ink">
          Extra notes
        </h2>
        {state.error || state.success ? (
          <Alert variant={state.error ? "destructive" : "default"}>
            <AlertDescription>{state.error ?? state.success}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="value_props">Value props (one per line)</Label>
          <Textarea
            id="value_props"
            name="value_props"
            rows={3}
            defaultValue={lines(g.value_props).join("\n")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={4}
            defaultValue={String(g.notes ?? "")}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save guidelines"}
        </Button>
      </form>
    </div>
  );
}
