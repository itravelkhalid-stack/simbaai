"use client";

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
        <div className="flex flex-wrap gap-2">
          {(
            Object.keys(INDUSTRY_PRESETS) as Array<
              Exclude<ComplianceIndustryPreset, "custom">
            >
          ).map((key) => (
            <form key={key} action={applyIndustryPreset}>
              <input type="hidden" name="brandId" value={brandId} />
              <input type="hidden" name="industry" value={key} />
              <Button
                type="submit"
                size="sm"
                variant={profile.industry === key ? "default" : "outline"}
              >
                {COMPLIANCE_INDUSTRY_LABELS[key]}
              </Button>
            </form>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Presets pre-populate rules, disclaimers, and bans — all editable below.
        </p>
      </section>

      <form action={action} className="space-y-4 rounded-xl border p-4">
        <input type="hidden" name="brandId" value={brandId} />
        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <select
            id="industry"
            name="industry"
            defaultValue={profile.industry}
            className="flex h-9 w-full rounded-md border bg-transparent px-2 text-sm"
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
