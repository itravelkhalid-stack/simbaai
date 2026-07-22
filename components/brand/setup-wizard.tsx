"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  createBrand,
  deleteBrandAudience,
  deleteBrandProduct,
  extractBrandFromUrl,
  saveBrandBasics,
  saveBrandVisual,
  saveBrandVoice,
  upsertBrandAudience,
  upsertBrandProduct,
  type BrandActionResult,
} from "@/lib/brand/actions";
import type { Brand, BrandAudience, BrandProduct } from "@/lib/types/research";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const initial: BrandActionResult = {};

const STEPS = [
  { id: "basics", label: "Basics" },
  { id: "visual", label: "Visual identity" },
  { id: "voice", label: "Voice" },
  { id: "audiences", label: "Audiences" },
  { id: "products", label: "Products" },
] as const;

export type WizardStep = (typeof STEPS)[number]["id"];

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export function BrandSetupWizard({
  brand,
  audiences,
  products,
  step,
}: {
  brand: Brand;
  audiences: BrandAudience[];
  products: BrandProduct[];
  step: WizardStep;
}) {
  const guidelines = (brand.guidelines ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <Link
            key={s.id}
            href={`/brand/setup?brandId=${brand.id}&step=${s.id}`}
            className={cn(
              buttonVariants({
                variant: s.id === step ? "default" : "outline",
                size: "sm",
              }),
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {step === "basics" ? <BasicsForm brand={brand} /> : null}
      {step === "visual" ? <VisualForm brand={brand} /> : null}
      {step === "voice" ? (
        <VoiceForm brand={brand} guidelines={guidelines} />
      ) : null}
      {step === "audiences" ? (
        <AudiencesForm brandId={brand.id} audiences={audiences} />
      ) : null}
      {step === "products" ? (
        <ProductsForm brandId={brand.id} products={products} />
      ) : null}

      <ExtractPanel brand={brand} />
    </div>
  );
}

export function CreateBrandForm() {
  const [state, action, pending] = useActionState(createBrand, initial);
  return (
    <form action={action} className="space-y-4 rounded-xl border p-4">
      <h2 className="font-medium">Create a brand</h2>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="name">Brand name</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="website">Website</Label>
        <Input id="website" name="website" type="url" placeholder="https://" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create brand"}
      </Button>
    </form>
  );
}

function BasicsForm({ brand }: { brand: Brand }) {
  const [state, action, pending] = useActionState(saveBrandBasics, initial);
  // Remount fields when server brand updates after save (avoids Base UI defaultValue warning)
  const fieldKey = brand.updated_at;
  return (
    <form action={action} className="space-y-4 rounded-xl border p-4">
      <input type="hidden" name="brandId" value={brand.id} />
      <h2 className="font-medium">Basics</h2>
      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription>{state.error ?? state.success}</AlertDescription>
        </Alert>
      ) : null}
      <div key={fieldKey} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={brand.name} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            name="website"
            type="url"
            defaultValue={brand.website ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tagline">Tagline</Label>
          <Input
            id="tagline"
            name="tagline"
            defaultValue={brand.tagline ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="positioning">Positioning</Label>
          <Textarea
            id="positioning"
            name="positioning"
            rows={3}
            defaultValue={brand.positioning ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="target_audience">Target audience summary</Label>
          <Textarea
            id="target_audience"
            name="target_audience"
            rows={3}
            defaultValue={brand.target_audience ?? ""}
          />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save basics"}
      </Button>
    </form>
  );
}

function VisualForm({ brand }: { brand: Brand }) {
  const [state, action, pending] = useActionState(saveBrandVisual, initial);
  const fieldKey = brand.updated_at;
  return (
    <form action={action} className="space-y-4 rounded-xl border p-4">
      <input type="hidden" name="brandId" value={brand.id} />
      <h2 className="font-medium">Visual identity</h2>
      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription>{state.error ?? state.success}</AlertDescription>
        </Alert>
      ) : null}
      <div key={fieldKey} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="logo_url">Logo URL</Label>
          <Input
            id="logo_url"
            name="logo_url"
            type="url"
            defaultValue={brand.logo_url ?? ""}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["primary_color", "Primary", brand.primary_color],
              ["secondary_color", "Secondary", brand.secondary_color],
              ["accent_color", "Accent", brand.accent_color],
            ] as const
          ).map(([name, label, value]) => (
            <div key={name} className="space-y-2">
              <Label htmlFor={name}>{label}</Label>
              <div className="flex gap-2">
                <Input
                  id={name}
                  name={name}
                  defaultValue={value ?? ""}
                  placeholder="#0F172A"
                />
                {value ? (
                  <span
                    className="h-9 w-9 shrink-0 rounded-md border"
                    style={{ backgroundColor: value }}
                    aria-hidden
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="font_heading">Heading font</Label>
            <Input
              id="font_heading"
              name="font_heading"
              defaultValue={brand.font_heading ?? ""}
              placeholder="e.g. Fraunces"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="font_body">Body font</Label>
            <Input
              id="font_body"
              name="font_body"
              defaultValue={brand.font_body ?? ""}
              placeholder="e.g. Source Sans 3"
            />
          </div>
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save visual identity"}
      </Button>
    </form>
  );
}

function VoiceForm({
  brand,
  guidelines,
}: {
  brand: Brand;
  guidelines: Record<string, unknown>;
}) {
  const [state, action, pending] = useActionState(saveBrandVoice, initial);
  const fieldKey = brand.updated_at;
  return (
    <form action={action} className="space-y-4 rounded-xl border p-4">
      <input type="hidden" name="brandId" value={brand.id} />
      <h2 className="font-medium">Brand voice</h2>
      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription>{state.error ?? state.success}</AlertDescription>
        </Alert>
      ) : null}
      <div key={fieldKey} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="brand_voice">Voice description</Label>
          <Textarea
            id="brand_voice"
            name="brand_voice"
            rows={4}
            defaultValue={brand.brand_voice ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tone">Tone</Label>
          <Input
            id="tone"
            name="tone"
            defaultValue={String(guidelines.tone ?? "")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="do_say">Do say (one per line)</Label>
          <Textarea
            id="do_say"
            name="do_say"
            rows={3}
            defaultValue={asStringArray(guidelines.do_say).join("\n")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dont_say">Don&apos;t say (one per line)</Label>
          <Textarea
            id="dont_say"
            name="dont_say"
            rows={3}
            defaultValue={asStringArray(guidelines.dont_say).join("\n")}
          />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save voice"}
      </Button>
    </form>
  );
}

function AudiencesForm({
  brandId,
  audiences,
}: {
  brandId: string;
  audiences: BrandAudience[];
}) {
  const [state, action, pending] = useActionState(upsertBrandAudience, initial);
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {audiences.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"
          >
            <div>
              <p className="font-medium">{a.name}</p>
              <p className="text-sm text-muted-foreground">
                {a.description ?? "No description"}
              </p>
              {a.messaging_angles?.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Angles: {a.messaging_angles.join("; ")}
                </p>
              ) : null}
            </div>
            <form action={deleteBrandAudience}>
              <input type="hidden" name="audienceId" value={a.id} />
              <Button type="submit" variant="outline" size="sm">
                Remove
              </Button>
            </form>
          </li>
        ))}
      </ul>
      <form action={action} className="space-y-4 rounded-xl border p-4">
        <input type="hidden" name="brandId" value={brandId} />
        <h2 className="font-medium">Add audience</h2>
        {state.error || state.success ? (
          <Alert variant={state.error ? "destructive" : "default"}>
            <AlertDescription>{state.error ?? state.success}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="aud-name">Name</Label>
          <Input id="aud-name" name="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="aud-desc">Description</Label>
          <Textarea id="aud-desc" name="description" rows={2} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="aud-angles">Messaging angles</Label>
          <Textarea id="aud-angles" name="messaging_angles" rows={2} />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add audience"}
        </Button>
      </form>
    </div>
  );
}

function ProductsForm({
  brandId,
  products,
}: {
  brandId: string;
  products: BrandProduct[];
}) {
  const [state, action, pending] = useActionState(upsertBrandProduct, initial);
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {products.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"
          >
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-muted-foreground">
                {p.description ?? "No description"}
              </p>
              {p.price_pence != null ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.currency} {(p.price_pence / 100).toFixed(2)}
                </p>
              ) : null}
            </div>
            <form action={deleteBrandProduct}>
              <input type="hidden" name="productId" value={p.id} />
              <Button type="submit" variant="outline" size="sm">
                Remove
              </Button>
            </form>
          </li>
        ))}
      </ul>
      <form action={action} className="space-y-4 rounded-xl border p-4">
        <input type="hidden" name="brandId" value={brandId} />
        <h2 className="font-medium">Add product / offer</h2>
        {state.error || state.success ? (
          <Alert variant={state.error ? "destructive" : "default"}>
            <AlertDescription>{state.error ?? state.success}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="prod-name">Name</Label>
          <Input id="prod-name" name="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prod-desc">Description</Label>
          <Textarea id="prod-desc" name="description" rows={2} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="prod-cat">Category</Label>
            <Input id="prod-cat" name="category" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prod-price">Price (major units)</Label>
            <Input
              id="prod-price"
              name="price_major"
              type="number"
              min="0"
              step="0.01"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prod-url">URL</Label>
            <Input id="prod-url" name="url" type="url" />
          </div>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add product"}
        </Button>
      </form>
    </div>
  );
}

function ExtractPanel({ brand }: { brand: Brand }) {
  const [state, action, pending] = useActionState(extractBrandFromUrl, initial);
  return (
    <form
      action={action}
      className="space-y-4 rounded-xl border border-dashed p-4"
    >
      <input type="hidden" name="brandId" value={brand.id} />
      <h2 className="font-medium">AI extraction from website</h2>
      <p className="text-sm text-muted-foreground">
        Fetch the site and fill name, voice, colors, audiences, and products.
        Counts toward monthly AI runs.
      </p>
      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription>{state.error ?? state.success}</AlertDescription>
        </Alert>
      ) : null}
      <div key={brand.updated_at} className="space-y-2">
        <Label htmlFor="websiteUrl">Website URL</Label>
        <Input
          id="websiteUrl"
          name="websiteUrl"
          type="url"
          required
          defaultValue={brand.website ?? ""}
          placeholder="https://example.com"
        />
      </div>
      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? "Extracting…" : "Extract with AI"}
      </Button>
    </form>
  );
}
