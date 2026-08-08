import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  findSimilarTopic,
  normalizeTopicText,
  topicTokenSimilarity,
} from "@/lib/content/topic-similarity";
import type { AdPlatform } from "@/lib/types/ads";

const OPEN_CAMPAIGN_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "active",
  "paused",
] as const;

const OPEN_PLAN_STATUSES = ["draft", "pending_approval", "approved"] as const;

export function funnelBucket(stage: string | null | undefined): string {
  const s = (stage ?? "").toLowerCase();
  if (/retarget|remarket|warm/.test(s)) return "retargeting";
  if (/consider|intent|traffic|click/.test(s)) return "consideration";
  if (/aware|reach|prospect|inspir/.test(s)) return "awareness";
  if (/conver|purchase|book|sales/.test(s)) return "conversion";
  return "other";
}

export function destinationKey(params: {
  destinationSlug?: string | null;
  focusText?: string | null;
  name?: string | null;
}): string {
  const slug = (params.destinationSlug ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/)[0]
    .split("/")
    .filter(Boolean)
    .pop();
  if (slug && /^[a-z0-9-]{2,40}$/.test(slug) && !slug.includes(".")) {
    return slug;
  }
  const hay = normalizeTopicText(
    `${params.destinationSlug ?? ""} ${params.focusText ?? ""} ${params.name ?? ""}`,
  );
  const known = [
    "dubai",
    "marmaris",
    "antalya",
    "bodrum",
    "istanbul",
    "london",
    "paris",
    "barcelona",
    "rome",
    "athens",
    "crete",
    "rhodes",
    "cyprus",
    "tenerife",
    "mallorca",
  ];
  for (const d of known) {
    if (hay.includes(d)) return d;
  }
  const tokens = hay.split(" ").filter((t) => t.length >= 4);
  return tokens[0] ?? "unknown";
}

export async function findNearDuplicateCampaign(params: {
  organizationId: string;
  brandId: string;
  name: string;
  funnelStage: string;
  destinationSlug?: string | null;
  focusText?: string | null;
  platform?: AdPlatform;
  days?: number;
}): Promise<{ id: string; name: string; score: number } | null> {
  const supabase = createAdminClient();
  const days = params.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const dest = destinationKey({
    destinationSlug: params.destinationSlug,
    focusText: params.focusText,
    name: params.name,
  });
  const bucket = funnelBucket(params.funnelStage);

  let q = supabase
    .from("ad_campaigns")
    .select("id, name, funnel_stage, targeting, created_at, platform")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .in("status", [...OPEN_CAMPAIGN_STATUSES])
    .gte("created_at", since)
    .limit(200);
  if (params.platform) q = q.eq("platform", params.platform);

  const { data } = await q;
  const rows = data ?? [];
  for (const row of rows) {
    const rowDest = destinationKey({
      name: row.name,
      focusText:
        typeof (row.targeting as { notes?: string } | null)?.notes === "string"
          ? (row.targeting as { notes: string }).notes
          : null,
    });
    if (rowDest !== dest && dest !== "unknown") continue;
    if (funnelBucket(row.funnel_stage) !== bucket) continue;
    const score = Math.max(
      topicTokenSimilarity(params.name, row.name),
      findSimilarTopic(params.name, [{ id: row.id, title: row.name }])?.score ??
        0,
    );
    if (score >= 0.45 || rowDest === dest) {
      return { id: row.id, name: row.name, score: Math.max(score, 0.5) };
    }
  }
  return null;
}

export async function findNearDuplicateMediaPlan(params: {
  organizationId: string;
  brandId: string;
  name: string;
  directiveId?: string | null;
  destinationSlug?: string | null;
  focusText?: string | null;
  days?: number;
}): Promise<{ id: string; name: string; reason: string } | null> {
  const supabase = createAdminClient();
  if (params.directiveId) {
    const { data } = await supabase
      .from("ad_media_plans")
      .select("id, name")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .eq("directive_id", params.directiveId)
      .in("status", [...OPEN_PLAN_STATUSES])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      return {
        id: data.id,
        name: data.name,
        reason: "An open media plan already exists for this directive",
      };
    }
  }

  const days = params.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const dest = destinationKey({
    destinationSlug: params.destinationSlug,
    focusText: params.focusText,
    name: params.name,
  });
  const { data: plans } = await supabase
    .from("ad_media_plans")
    .select("id, name")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .in("status", [...OPEN_PLAN_STATUSES])
    .gte("created_at", since)
    .limit(100);

  for (const plan of plans ?? []) {
    const planDest = destinationKey({ name: plan.name });
    const similar =
      findSimilarTopic(params.name, [{ id: plan.id, title: plan.name }]) ??
      null;
    if (
      (dest !== "unknown" && planDest === dest) ||
      (similar && similar.score >= 0.5)
    ) {
      return {
        id: plan.id,
        name: plan.name,
        reason: `Near-duplicate of existing plan "${plan.name}"`,
      };
    }
  }
  return null;
}
