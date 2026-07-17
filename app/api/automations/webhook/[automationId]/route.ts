import { NextResponse } from "next/server";

import { runAutomation } from "@/lib/automations/runner";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Automation } from "@/lib/types/automations";

export async function POST(
  request: Request,
  context: { params: Promise<{ automationId: string }> },
) {
  const { automationId } = await context.params;
  const secret =
    request.headers.get("x-automation-secret") ||
    new URL(request.url).searchParams.get("secret") ||
    "";

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("automations")
    .select("*")
    .eq("id", automationId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const automation = data as Automation;
  if (automation.status !== "active") {
    return NextResponse.json({ error: "Automation not active" }, { status: 409 });
  }
  if (
    automation.trigger?.type !== "webhook" ||
    !automation.webhook_secret ||
    secret !== automation.webhook_secret
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const run = await runAutomation({
    automation,
    triggerData: { source: "webhook", ...body },
  });

  return NextResponse.json({
    ok: run.status === "success" || run.status === "skipped",
    runId: run.id,
    status: run.status,
  });
}
