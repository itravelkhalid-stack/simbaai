"use client";

import { useActionState } from "react";

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

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Identity</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium">{brand.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tagline</dt>
            <dd>{brand.tagline ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Positioning</dt>
            <dd className="whitespace-pre-wrap">{brand.positioning ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Voice</dt>
            <dd className="whitespace-pre-wrap">{brand.brand_voice ?? "—"}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-3">
          {[brand.primary_color, brand.secondary_color, brand.accent_color]
            .filter(Boolean)
            .map((c) => (
              <div key={c!} className="flex items-center gap-2 text-sm">
                <span
                  className="h-8 w-8 rounded-md border"
                  style={{ backgroundColor: c! }}
                />
                {c}
              </div>
            ))}
          {(brand.font_heading || brand.font_body) && (
            <p className="text-sm text-muted-foreground">
              Fonts: {[brand.font_heading, brand.font_body].filter(Boolean).join(" / ")}
            </p>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Do / don&apos;t</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-medium text-emerald-700">Do say</p>
            <ul className="list-inside list-disc text-sm">
              {lines(g.do_say).length
                ? lines(g.do_say).map((x) => <li key={x}>{x}</li>)
                : <li className="list-none text-muted-foreground">None yet</li>}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-red-700">Don&apos;t say</p>
            <ul className="list-inside list-disc text-sm">
              {lines(g.dont_say).length
                ? lines(g.dont_say).map((x) => <li key={x}>{x}</li>)
                : <li className="list-none text-muted-foreground">None yet</li>}
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Audiences</h2>
        <ul className="space-y-2 text-sm">
          {audiences.length ? (
            audiences.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.name}</span>
                {a.description ? ` — ${a.description}` : ""}
              </li>
            ))
          ) : (
            <li className="text-muted-foreground">No audiences yet</li>
          )}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Products</h2>
        <ul className="space-y-2 text-sm">
          {products.length ? (
            products.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{p.name}</span>
                {p.description ? ` — ${p.description}` : ""}
              </li>
            ))
          ) : (
            <li className="text-muted-foreground">No products yet</li>
          )}
        </ul>
      </section>

      <form action={action} className="space-y-4 rounded-xl border p-4">
        <input type="hidden" name="brandId" value={brand.id} />
        <h2 className="font-medium">Extra notes</h2>
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
