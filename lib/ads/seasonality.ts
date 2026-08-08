import "server-only";

import {
  evaluateDestinationBookingWindow,
  listAdmissibleStayMonths,
  type SeasonalityMonthRow,
} from "@/lib/ads/booking-window";
import { adsTable } from "@/lib/ads/db";
import { createAdminClient } from "@/lib/supabase/admin";

export async function listSeasonalityRows(params: {
  organizationId: string;
  brandId: string;
  destinationSlug?: string;
}): Promise<SeasonalityMonthRow[]> {
  const supabase = createAdminClient();
  let q = adsTable(supabase, "destination_seasonality")
    .select(
      "destination_slug, destination_name, stay_month, visit_attractiveness, booking_lead_min_days, booking_lead_max_days, notes",
    )
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .order("destination_slug")
    .order("stay_month");
  if (params.destinationSlug) {
    q = q.eq("destination_slug", params.destinationSlug);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as SeasonalityMonthRow[];
}

export async function upsertSeasonalityRows(params: {
  organizationId: string;
  brandId: string;
  rows: Array<
    SeasonalityMonthRow & {
      notes?: string | null;
      evidence?: unknown[];
      source?: "human" | "research_agent" | "seed";
    }
  >;
}) {
  const supabase = createAdminClient();
  const payload = params.rows.map((r) => ({
    organization_id: params.organizationId,
    brand_id: params.brandId,
    destination_slug: r.destination_slug,
    destination_name: r.destination_name,
    stay_month: r.stay_month,
    visit_attractiveness: r.visit_attractiveness,
    booking_lead_min_days: r.booking_lead_min_days,
    booking_lead_max_days: r.booking_lead_max_days,
    notes: r.notes ?? null,
    evidence: r.evidence ?? [],
    source: r.source ?? "human",
    last_researched_at:
      r.source === "research_agent" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await adsTable(supabase, "destination_seasonality").upsert(payload, {
    onConflict: "organization_id,brand_id,destination_slug,stay_month",
  });
  if (error) throw new Error(error.message);
}

export async function getAdmissibleDestinations(params: {
  organizationId: string;
  brandId: string;
  asOf?: Date;
}) {
  const rows = await listSeasonalityRows(params);
  return listAdmissibleStayMonths(rows, params.asOf ?? new Date());
}

export async function evaluateDestinationFocus(params: {
  organizationId: string;
  brandId: string;
  destinationSlug: string;
  stayMonth?: number;
  asOf?: Date;
}) {
  const rows = await listSeasonalityRows({
    organizationId: params.organizationId,
    brandId: params.brandId,
    destinationSlug: params.destinationSlug,
  });
  if (!rows.length) {
    return {
      ok: false as const,
      reason: `No seasonality data for ${params.destinationSlug}`,
      decisions: [],
    };
  }
  const asOf = params.asOf ?? new Date();
  if (params.stayMonth) {
    const row = rows.find((r) => r.stay_month === params.stayMonth);
    if (!row) {
      return {
        ok: false as const,
        reason: `No seasonality row for month ${params.stayMonth}`,
        decisions: [],
      };
    }
    const decision = evaluateDestinationBookingWindow(row, asOf);
    return { ok: decision.ok, reason: decision.reason, decisions: [decision] };
  }
  const admissible = listAdmissibleStayMonths(rows, asOf);
  if (!admissible.length) {
    return {
      ok: false as const,
      reason: `No admissible stay months for ${params.destinationSlug} right now`,
      decisions: rows.map((r) => evaluateDestinationBookingWindow(r, asOf)),
    };
  }
  return {
    ok: true as const,
    reason: `Admissible stay months: ${admissible.map((a) => a.stay_month).join(", ")}`,
    decisions: admissible.map((a) => a.decision),
  };
}
