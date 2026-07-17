"use client";

import { useActionState } from "react";

import {
  saveMeetingsSettings,
  type MeetingsActionResult,
} from "@/lib/meetings/actions";
import type { MeetingsOrgSettings } from "@/lib/types/meetings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: MeetingsActionResult = {};

export function MeetingsSettingsForm({
  settings,
}: {
  settings: MeetingsOrgSettings;
}) {
  const [state, action, pending] = useActionState(saveMeetingsSettings, initial);

  return (
    <form action={action} className="space-y-6 rounded-xl border p-4">
      <section className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="dailyEnabled"
            defaultChecked={settings.daily_standup_enabled}
          />
          Daily standup
        </label>
        <div className="space-y-2 pl-6">
          <Label htmlFor="dailyHour">Hour (UTC)</Label>
          <Input
            id="dailyHour"
            name="dailyHour"
            type="number"
            min={0}
            max={23}
            defaultValue={settings.daily_standup_hour_utc}
          />
        </div>
      </section>

      <section className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="weeklyEnabled"
            defaultChecked={settings.weekly_marketing_enabled}
          />
          Weekly marketing meeting
        </label>
        <div className="grid gap-3 pl-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="weeklyWeekday">Weekday (1=Mon … 7=Sun)</Label>
            <Input
              id="weeklyWeekday"
              name="weeklyWeekday"
              type="number"
              min={1}
              max={7}
              defaultValue={settings.weekly_marketing_weekday}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weeklyHour">Hour (UTC)</Label>
            <Input
              id="weeklyHour"
              name="weeklyHour"
              type="number"
              min={0}
              max={23}
              defaultValue={settings.weekly_marketing_hour_utc}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="monthlyEnabled"
            defaultChecked={settings.monthly_board_enabled}
          />
          Monthly board
        </label>
        <div className="grid gap-3 pl-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="monthlyDay">Day of month (1–28)</Label>
            <Input
              id="monthlyDay"
              name="monthlyDay"
              type="number"
              min={1}
              max={28}
              defaultValue={settings.monthly_board_day}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="monthlyHour">Hour (UTC)</Label>
            <Input
              id="monthlyHour"
              name="monthlyHour"
              type="number"
              min={0}
              max={23}
              defaultValue={settings.monthly_board_hour_utc}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="quarterlyEnabled"
            defaultChecked={settings.quarterly_board_enabled}
          />
          Quarterly board (1st of Jan/Apr/Jul/Oct)
        </label>
        <div className="space-y-2 pl-6">
          <Label htmlFor="quarterlyHour">Hour (UTC)</Label>
          <Input
            id="quarterlyHour"
            name="quarterlyHour"
            type="number"
            min={0}
            max={23}
            defaultValue={settings.quarterly_board_hour_utc}
          />
        </div>
      </section>

      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription>{state.error || state.success}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save schedule"}
      </Button>
    </form>
  );
}
