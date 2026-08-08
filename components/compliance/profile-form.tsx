"use client";
import { fieldSelectClass } from "@/lib/ui/field";

import { useActionState } from "react";

import {
  applyIndustryPreset,
  upsertComplianceProfile,
  type ComplianceActionResult,
} from "@/lib/compliance/actions";
import { INDUSTRY_PRESETS } from "@/lib/compliance/presets";
import type {
  ComplianceIndustryPreset,
  ComplianceProfile,
} from "@/lib/types/compliance";
import { COMPLIANCE_INDUSTRY_LABELS } from "@/lib/types/compliance";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: ComplianceActionResult = {};

export function ComplianceProfileForm({
  brandId,
  profile,
}: {
  brandId: string;
  profile: ComplianceProfile;
}) {
  const [state, action, pending] = useActionState(
    upsertComplianceProfile,
    initial,
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border p-4">
        <p className="mb-3 text-sm font-medium">Industry presets</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Each button immediately overwrites rules, banned claims, and
          disclaimers for this brand. Confirm before applying — browsing by
          click leaves the last preset selected.
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            Object.keys(INDUSTRY_PRESETS) as Array<
              Exclude<ComplianceIndustryPreset, "custom">
            >
          ).map((key) => {
            const label = COMPLIANCE_INDUSTRY_LABELS[key];
            const active = profile.industry === key;
            return (
              <form
                key={key}
                action={applyIndustryPreset}
                onSubmit={(e) => {
                  if (active) {
                    e.preventDefault();
                    return;
                  }
                  const ok = window.confirm(
                    `Replace this brand's compliance rules with the “${label}” preset?\n\nThis overwrites rules, banned claims, and required disclaimers.`,
                  );
                  if (!ok) e.preventDefault();
                }}
              >
                <input type="hidden" name="brandId" value={brandId} />
                <input type="hidden" name="industry" value={key} />
                <Button
                  type="submit"
                  size="sm"
                  variant={active ? "default" : "outline"}
                >
                  {active ? `✓ ${label}` : `Apply ${label}`}
                </Button>
              </form>
            );
          })}
        </div>
      </section>

      <form action={action} className="space-y-4 rounded-xl border p-4">
        <input type="hidden" name="brandId" value={brandId} />
        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <select
            id="industry"
            name="industry"
            defaultValue={profile.industry}
            className={fieldSelectClass}
          >
            {(
              Object.keys(COMPLIANCE_INDUSTRY_LABELS) as ComplianceIndustryPreset[]
            ).map((k) => (
              <option key={k} value={k}>
                {COMPLIANCE_INDUSTRY_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="regulated"
            defaultChecked={profile.regulated}
          />
          Regulated category
        </label>
        <div className="space-y-2">
          <Label htmlFor="jurisdictions">Jurisdictions (comma or newline)</Label>
          <Textarea
            id="jurisdictions"
            name="jurisdictions"
            rows={2}
            defaultValue={(profile.jurisdictions ?? []).join("\n")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="required_disclaimers">Required disclaimers</Label>
          <Textarea
            id="required_disclaimers"
            name="required_disclaimers"
            rows={3}
            defaultValue={(profile.required_disclaimers ?? []).join("\n")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="approved_claims">
            Approved claims (pre-cleared wording)
          </Label>
          <Textarea
            id="approved_claims"
            name="approved_claims"
            rows={4}
            placeholder={"Price Match Guarantee\nBest Price Guarantee (T&Cs apply)"}
            defaultValue={(profile.approved_claims ?? []).join("\n")}
          />
          <p className="text-xs text-muted-foreground">
            Exact or near-exact phrases the brand may use without unsubstantiated
            claim flags. One claim per line.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="terms_urls">Terms / disclaimer URLs</Label>
          <Textarea
            id="terms_urls"
            name="terms_urls"
            rows={3}
            placeholder={"https://example.com/terms\nhttps://example.com/price-match"}
            defaultValue={(profile.terms_urls ?? []).join("\n")}
          />
          <p className="text-xs text-muted-foreground">
            Canonical T&amp;Cs / disclaimer pages. Also merged into the publish
            link allowlist.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="banned_claims">Banned claims</Label>
          <Textarea
            id="banned_claims"
            name="banned_claims"
            rows={3}
            defaultValue={(profile.banned_claims ?? []).join("\n")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="banned_terms">Banned terms</Label>
          <Textarea
            id="banned_terms"
            name="banned_terms"
            rows={2}
            defaultValue={(profile.banned_terms ?? []).join("\n")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rules_json">Rules (JSON)</Label>
          <Textarea
            id="rules_json"
            name="rules_json"
            rows={12}
            className="font-mono text-xs"
            defaultValue={JSON.stringify(profile.rules ?? [], null, 2)}
          />
        </div>
        {state.error || state.success ? (
          <Alert variant={state.error ? "destructive" : "default"}>
            <AlertDescription>{state.error || state.success}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </div>
  );
}
