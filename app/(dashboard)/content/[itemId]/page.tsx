import { notFound } from "next/navigation";

import { ContentItemEditor } from "@/components/content/item-editor";
import { ContentNav } from "@/components/content/content-nav";
import { Badge } from "@/components/ui/badge";
import { getLatestComplianceCheck } from "@/lib/compliance/check";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import {
  FORMAT_LABELS,
  PLATFORM_LABELS,
  STATUS_LABELS,
  type ContentComment,
  type ContentItem,
} from "@/lib/types/content";

export default async function ContentItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data: item, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("id", itemId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!item) notFound();

  const [{ data: comments }, complianceCheck] = await Promise.all([
    supabase
      .from("content_comments")
      .select("*")
      .eq("item_id", itemId)
      .eq("organization_id", active.organization_id)
      .order("created_at", { ascending: true }),
    getLatestComplianceCheck({
      organizationId: active.organization_id,
      entityType: "content",
      entityId: itemId,
    }),
  ]);

  const typed = item as ContentItem;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <ContentNav current="/content/queue" />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{PLATFORM_LABELS[typed.platform]}</Badge>
          <Badge variant="outline">{FORMAT_LABELS[typed.format]}</Badge>
          <Badge>{STATUS_LABELS[typed.status]}</Badge>
          {typed.ai_generated ? <Badge variant="secondary">AI</Badge> : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {typed.title || "Content item"}
        </h1>
      </div>
      <ContentItemEditor
        item={typed}
        comments={(comments ?? []) as ContentComment[]}
        canWrite={active.role !== "org_viewer"}
        complianceCheck={complianceCheck}
        canOverride={
          active.role === "org_owner" || active.role === "org_admin"
        }
      />
    </div>
  );
}
