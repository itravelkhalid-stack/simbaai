import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentNav } from "@/components/content/content-nav";
import {
  generateApprovedSlots,
  setPlanSlotStatus,
} from "@/lib/content/actions";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import {
  FORMAT_LABELS,
  PLATFORM_LABELS,
  type ContentPlan,
  type ContentPlanSlot,
} from "@/lib/types/content";
import { cn } from "@/lib/utils";

export default async function ContentPlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data: plan, error } = await supabase
    .from("content_plans")
    .select("*")
    .eq("id", planId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!plan) notFound();

  const { data: slots, error: slotsError } = await supabase
    .from("content_plan_slots")
    .select("*")
    .eq("plan_id", planId)
    .eq("organization_id", active.organization_id)
    .order("sort_order");

  if (slotsError) throw new Error(slotsError.message);

  const typedPlan = plan as ContentPlan;
  const typedSlots = (slots ?? []) as ContentPlanSlot[];
  const approvedCount = typedSlots.filter((s) => s.status === "approved").length;
  const canWrite = active.role !== "org_viewer";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <ContentNav current="/content/generate" />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{typedPlan.status}</Badge>
          <span className="text-sm text-muted-foreground">
            {typedPlan.start_date} → {typedPlan.end_date}
          </span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{typedPlan.title}</h1>
        <p className="text-muted-foreground">
          Review the proposed mix, approve slots, then generate copy for approved rows.
        </p>
      </div>

      {canWrite && typedPlan.status === "proposed" ? (
        <form action={generateApprovedSlots}>
          <input type="hidden" name="planId" value={typedPlan.id} />
          <button
            type="submit"
            className={cn(buttonVariants())}
            disabled={approvedCount === 0}
          >
            Generate approved slots ({approvedCount})
          </button>
        </form>
      ) : null}

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {typedSlots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  Waiting for agent proposal…
                </TableCell>
              </TableRow>
            ) : (
              typedSlots.map((slot) => (
                <TableRow key={slot.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {slot.scheduled_at
                      ? new Date(slot.scheduled_at).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell>{PLATFORM_LABELS[slot.platform]}</TableCell>
                  <TableCell>{FORMAT_LABELS[slot.format]}</TableCell>
                  <TableCell>{slot.topic}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{slot.status}</Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {slot.content_item_id ? (
                      <Link
                        href={`/content/${slot.content_item_id}`}
                        className="text-sm underline"
                      >
                        Open
                      </Link>
                    ) : null}
                    {canWrite && slot.status === "proposed" ? (
                      <>
                        <form action={setPlanSlotStatus} className="inline">
                          <input type="hidden" name="slotId" value={slot.id} />
                          <input type="hidden" name="status" value="approved" />
                          <button type="submit" className="text-sm underline">
                            Approve
                          </button>
                        </form>
                        <form action={setPlanSlotStatus} className="inline">
                          <input type="hidden" name="slotId" value={slot.id} />
                          <input type="hidden" name="status" value="rejected" />
                          <button type="submit" className="text-sm underline">
                            Reject
                          </button>
                        </form>
                      </>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
