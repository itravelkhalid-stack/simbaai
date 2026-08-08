import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  findSimilarTopic,
  isNearDuplicateTopic,
} from "@/lib/content/topic-similarity";

const LOOKBACK_STATUSES = [
  "scheduled",
  "approved",
  "published",
  "pending_approval",
] as const;

/**
 * Load recent titles/topics for near-duplicate checks (last `days` days).
 */
export async function loadRecentTopicsForDedupe(params: {
  organizationId: string;
  brandId: string;
  days?: number;
  excludeItemId?: string;
}): Promise<Array<{ id: string; title: string }>> {
  const supabase = createAdminClient();
  const days = params.days ?? 14;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("content_items")
    .select("id, title, copy, scheduled_at, published_at, created_at")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .in("status", [...LOOKBACK_STATUSES])
    .or(
      `scheduled_at.gte.${since},published_at.gte.${since},created_at.gte.${since}`,
    )
    .limit(500);

  if (params.excludeItemId) {
    query = query.neq("id", params.excludeItemId);
  }

  const { data } = await query;
  return (data ?? [])
    .map((row) => ({
      id: row.id as string,
      title: String(row.title || row.copy || "").slice(0, 200),
    }))
    .filter((r) => r.title.trim().length > 0);
}

export async function findRecentNearDuplicate(params: {
  organizationId: string;
  brandId: string;
  title: string | null | undefined;
  copy?: string | null;
  excludeItemId?: string;
  days?: number;
}): Promise<{ id: string; title: string; score: number } | null> {
  const candidate = (params.title || params.copy || "").trim();
  if (candidate.length < 8) return null;

  const recent = await loadRecentTopicsForDedupe({
    organizationId: params.organizationId,
    brandId: params.brandId,
    days: params.days,
    excludeItemId: params.excludeItemId,
  });

  const hit = findSimilarTopic(candidate, recent);
  if (!hit?.id) return null;
  return { id: hit.id, title: hit.title, score: hit.score };
}

export { isNearDuplicateTopic, findSimilarTopic };
