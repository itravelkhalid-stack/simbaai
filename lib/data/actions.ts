"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  answerAnalyticsQuestion,
  planAnalyticsQuery,
} from "@/lib/agents/analytics/generate";
import { signOAuthState } from "@/lib/crypto";
import {
  getGa4AuthorizationUrl,
  saveGa4Connection,
  syncGa4Connection,
  getValidGa4AccessToken,
} from "@/lib/data/ga4";
import { executeWhitelistedQuery } from "@/lib/data/query-layer";
import { buildAnalyticsDailyRollups } from "@/lib/data/rollups";
import { inngest } from "@/lib/inngest/client";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Ga4Connection } from "@/lib/types/analytics";

export type DataActionResult = {
  error?: string;
  success?: string;
  answer?: string;
  chart?: import("@/lib/types/analytics").AnalyticsChartSpec;
};

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot modify analytics settings");
  }
  return ctx;
}

export async function startGa4OAuth(formData: FormData) {
  const { active } = await assertCanWrite();
  const brandId = String(formData.get("brandId") ?? "");
  if (!brandId) throw new Error("brandId required");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const redirectUri = `${site}/api/data/ga4/callback`;
  const state = signOAuthState({
    organizationId: active.organization_id,
    brandId,
    ts: String(Date.now()),
  });
  redirect(getGa4AuthorizationUrl({ state, redirectUri }));
}

export async function selectGa4Property(formData: FormData) {
  const { active } = await assertCanWrite();
  const brandId = String(formData.get("brandId") ?? "");
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const propertyName = String(formData.get("propertyName") ?? "").trim();
  if (!brandId || !propertyId) throw new Error("Property required");

  const supabase = await createClient();
  const { data: connection } = await supabase
    .from("ga4_connections")
    .select("*")
    .eq("organization_id", active.organization_id)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (!connection) throw new Error("Connect GA4 first");

  const accessToken = await getValidGa4AccessToken(connection as Ga4Connection);
  await saveGa4Connection({
    organizationId: active.organization_id,
    brandId,
    propertyId,
    propertyName: propertyName || null,
    accessToken,
    refreshToken: null,
    expiresAt: connection.token_expires_at
      ? new Date(connection.token_expires_at)
      : null,
  });
  revalidatePath("/data");
  revalidatePath("/data/settings");
}

export async function syncGa4Now(formData: FormData) {
  const { active } = await assertCanWrite();
  const brandId = String(formData.get("brandId") ?? "");
  const supabase = await createClient();
  const { data } = await supabase
    .from("ga4_connections")
    .select("*")
    .eq("organization_id", active.organization_id)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (!data) throw new Error("GA4 not connected");
  await syncGa4Connection(data as Ga4Connection, 14);
  await inngest.send({
    name: "analytics/rollup.run",
    data: { daysBack: 14 },
  });
  revalidatePath("/data");
}

export async function runRollupNow() {
  await assertCanWrite();
  await buildAnalyticsDailyRollups(14);
  revalidatePath("/data");
}

export async function askAnalytics(
  _prev: DataActionResult,
  formData: FormData,
): Promise<DataActionResult> {
  try {
    const { user, active } = await requireActiveOrg();
    const brandId = String(formData.get("brandId") ?? "");
    const question = String(formData.get("question") ?? "").trim();
    if (!brandId || !question) return { error: "Ask a question" };

    const supabase = await createClient();
    const { data: brand } = await supabase
      .from("brands")
      .select("id, name")
      .eq("id", brandId)
      .eq("organization_id", active.organization_id)
      .single();
    if (!brand) return { error: "Brand not found" };

    await supabase.from("analytics_chat_messages").insert({
      organization_id: active.organization_id,
      brand_id: brandId,
      user_id: user.id,
      role: "user",
      content: question,
    });

    const today = new Date().toISOString().slice(0, 10);
    const planned = await planAnalyticsQuery({
      question,
      brandName: brand.name,
      today,
    });

    const executed = await executeWhitelistedQuery({
      organizationId: active.organization_id,
      brandId,
      plan: planned.data,
    });

    const answered = await answerAnalyticsQuestion({
      question,
      plan: planned.data,
      resultSummary: executed.summary,
      rows: executed.rows,
    });

    await supabase.from("analytics_chat_messages").insert({
      organization_id: active.organization_id,
      brand_id: brandId,
      user_id: null,
      role: "assistant",
      content: answered.data.answer,
      query_plan: planned.data as unknown as Record<string, unknown>,
      chart: executed.chart,
    });

    revalidatePath("/data");
    return {
      success: "Answered",
      answer: answered.data.answer,
      chart: executed.chart,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Ask failed",
    };
  }
}

export async function acknowledgeAnomaly(formData: FormData) {
  const { active } = await assertCanWrite();
  const id = String(formData.get("anomalyId") ?? "");
  const supabase = await createClient();
  await supabase
    .from("analytics_anomalies")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", active.organization_id);
  revalidatePath("/data");
}
