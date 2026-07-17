import { MeetingsNav } from "@/components/meetings/meetings-nav";
import { MeetingsSettingsForm } from "@/components/meetings/settings-form";
import { parseMeetingsSettings } from "@/lib/meetings/settings";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";

export default async function MeetingsSettingsPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", active.organization_id)
    .single();
  const settings = parseMeetingsSettings(org?.settings as Record<string, unknown>);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Meeting schedule</h1>
        <p className="mt-2 text-muted-foreground">
          Meetings run as background jobs per brand at the UTC hours you configure.
        </p>
      </div>
      <MeetingsNav current="/meetings/settings" />
      <MeetingsSettingsForm settings={settings} />
    </div>
  );
}
