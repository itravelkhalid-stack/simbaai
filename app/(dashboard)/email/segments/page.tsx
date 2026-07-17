import { EmailNav } from "@/components/email/email-nav";
import { SegmentBuilder } from "@/components/email/segment-builder";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { EmailSegment } from "@/lib/types/email";

export default async function EmailSegmentsPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_segments")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Segments</h1>
        <p className="mt-2 text-muted-foreground">
          Rule builder with AND/OR groups across fields, tags, and custom attributes.
        </p>
      </div>
      <EmailNav current="/email/segments" />
      <SegmentBuilder />
      <ul className="space-y-2 text-sm">
        {((data ?? []) as EmailSegment[]).map((segment) => (
          <li key={segment.id} className="rounded-xl border p-3">
            <p className="font-medium">{segment.name}</p>
            <p className="text-muted-foreground">
              {segment.rules.combinator.toUpperCase()} · {segment.rules.rules.length}{" "}
              rules
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
