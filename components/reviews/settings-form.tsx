"use client";

import { useActionState } from "react";

import {
  saveBrandReportSettings,
  type ReviewsActionResult,
} from "@/lib/reviews/actions";
import type { BrandReportSettings } from "@/lib/types/reviews";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: ReviewsActionResult = {};

export function ReportSettingsForm({
  brandId,
  brandName,
  settings,
}: {
  brandId: string;
  brandName: string;
  settings: BrandReportSettings;
}) {
  const [state, action, pending] = useActionState(saveBrandReportSettings, initial);

  return (
    <form action={action} className="space-y-5 rounded-xl border p-4">
      <input type="hidden" name="brandId" value={brandId} />
      <p className="text-sm font-medium">{brandName}</p>

      <section className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dailyEnabled" defaultChecked={settings.daily_enabled} />
          Daily overnight report
        </label>
        <div className="pl-6">
          <Label htmlFor={`dailyHour-${brandId}`}>Hour UTC</Label>
          <Input
            id={`dailyHour-${brandId}`}
            name="dailyHour"
            type="number"
            min={0}
            max={23}
            defaultValue={settings.daily_hour_utc}
          />
        </div>
      </section>

      <section className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="weeklyEnabled" defaultChecked={settings.weekly_enabled} />
          Weekly (Monday mornings by default)
        </label>
        <div className="grid gap-2 pl-6 sm:grid-cols-2">
          <div>
            <Label>Weekday (1=Mon)</Label>
            <Input name="weeklyWeekday" type="number" min={1} max={7} defaultValue={settings.weekly_weekday} />
          </div>
          <div>
            <Label>Hour UTC</Label>
            <Input name="weeklyHour" type="number" min={0} max={23} defaultValue={settings.weekly_hour_utc} />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="monthlyEnabled" defaultChecked={settings.monthly_enabled} />
          Monthly (1st by default)
        </label>
        <div className="grid gap-2 pl-6 sm:grid-cols-2">
          <div>
            <Label>Day of month</Label>
            <Input name="monthlyDay" type="number" min={1} max={28} defaultValue={settings.monthly_day} />
          </div>
          <div>
            <Label>Hour UTC</Label>
            <Input name="monthlyHour" type="number" min={0} max={23} defaultValue={settings.monthly_hour_utc} />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="quarterlyEnabled" defaultChecked={settings.quarterly_enabled} />
          Quarterly (1st of quarter)
        </label>
        <div className="pl-6">
          <Label>Hour UTC</Label>
          <Input name="quarterlyHour" type="number" min={0} max={23} defaultValue={settings.quarterly_hour_utc} />
        </div>
      </section>

      <section className="space-y-2 border-t pt-4">
        <p className="text-sm font-medium">Branding & email</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label>Primary colour</Label>
            <Input name="primaryColor" defaultValue={settings.primary_color} />
          </div>
          <div>
            <Label>Secondary colour</Label>
            <Input name="secondaryColor" defaultValue={settings.secondary_color} />
          </div>
        </div>
        <div>
          <Label>Logo URL</Label>
          <Input name="logoUrl" defaultValue={settings.logo_url ?? ""} placeholder="https://…" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="autoEmail" defaultChecked={settings.auto_email_enabled} />
          Auto-email on completion
        </label>
        <div>
          <Label>Recipients (comma-separated)</Label>
          <Input
            name="recipients"
            defaultValue={(settings.recipients ?? []).join(", ")}
            placeholder="cmo@client.com"
          />
        </div>
      </section>

      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription>{state.error || state.success}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
