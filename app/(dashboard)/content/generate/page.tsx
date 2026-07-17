import { ContentNav } from "@/components/content/content-nav";
import { GenerateForms } from "@/components/content/generate-forms";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { ContentPillar } from "@/lib/types/content";

export default async function ContentGeneratePage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: pillars } = await supabase
    .from("content_pillars")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Generate</h1>
        <p className="mt-2 text-muted-foreground">
          Every run injects <code>getBrandContext()</code> — voice, audiences, pillars,
          and competitor notes.
        </p>
      </div>
      <ContentNav current="/content/generate" />
      <GenerateForms pillars={(pillars ?? []) as ContentPillar[]} />
    </div>
  );
}
