/**
 * Approved targeting brief → Meta Graph ad set targeting.
 * QA and post-create verification diff against this payload, not plan prose.
 */

export const WEBSITE_AUDIENCE_BLOCKER = {
  code: "meta_pixel_website_audience",
  title: "Website visitor exclusion needs Meta Pixel",
  body: "The approved brief excludes website visitors (last 30 days). That requires a website Custom Audience, which requires the Meta Pixel. This exclusion was not sent to Meta. Install the Pixel, create the audience, then re-sync targeting.",
  severity: "critical" as const,
  blocks_exclusion: true,
};

export const ADVANTAGE_AGE_BLOCKER = {
  code: "meta_advantage_audience_age_conflict",
  title: "Advantage+ audience cannot lock this age band",
  body: "Meta Advantage+ audience resets age_max to 65 and only allows age_min 18–25. The approved brief requires a hard age band, so Advantage+ audience was turned off and age_min/age_max were written as constraints.",
  severity: "warning" as const,
  blocks_advantage_audience: true,
};

export type PlacementSlot =
  | "facebook_feed"
  | "instagram_feed"
  | "instagram_reels";

export type TargetingSpec = {
  countries: string[];
  age_min: number | null;
  age_max: number | null;
  interest_names: string[];
  placements: PlacementSlot[];
  exclude_website_visitors_days: number | null;
  advantage_audience: boolean;
  optimization_goal: string;
};

export type SetupBlocker = {
  code: string;
  title: string;
  body: string;
  severity: "critical" | "warning";
};

export type GraphInterest = { id: string; name: string };

/** Brief phrases that are not Meta adinterest names. */
export const INTEREST_SEARCH_ALIASES: Record<string, string[]> = {
  "uae travel": ["United Arab Emirates"],
  uae: ["United Arab Emirates"],
  "beach holidays": ["Beach", "Resort"],
  "resort holidays": ["Resort"],
  "holiday deals": ["Travel"],
  "international travel": ["Travel", "Tourism"],
};

export function scoreAdInterestMatch(query: string, candidateName: string): number {
  const q = query.trim().toLowerCase();
  const n = candidateName.trim().toLowerCase();
  const base = n.replace(/\s*\([^)]*\)/g, "").trim();
  if (!q || !n) return 0;
  if (base === q || n === q) return 100;
  if (base.startsWith(q) || n.startsWith(q)) return 85;
  if (base.endsWith(q) && base !== q) return 40;
  if (base.includes(q) || n.includes(q)) return 70;
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return 0;
  const hit = words.filter((w) => base.includes(w) || n.includes(w)).length;
  if (hit === words.length) return 45;
  if (hit > 0) return Math.round((30 * hit) / words.length);
  return 0;
}

export function pickAdInterest(
  query: string,
  rows: Array<{ id?: string; name?: string }>,
): GraphInterest | null {
  let best: { score: number; interest: GraphInterest } | null = null;
  for (const row of rows) {
    if (!row.id || !row.name) continue;
    const score = scoreAdInterestMatch(query, row.name);
    if (score < 45) continue;
    const interest = { id: String(row.id), name: row.name };
    if (!best || score > best.score) best = { score, interest };
  }
  return best?.interest ?? null;
}

export function interestSearchQueries(name: string): string[] {
  const aliases = INTEREST_SEARCH_ALIASES[name.trim().toLowerCase()] ?? [];
  return Array.from(new Set([name, ...aliases]));
}

export type GraphTargeting = {
  geo_locations: { countries: string[] };
  age_min?: number;
  age_max?: number;
  flexible_spec?: Array<{ interests: GraphInterest[] }>;
  publisher_platforms?: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  targeting_automation?: { advantage_audience: 0 | 1 };
};

export type TargetingMismatch = {
  field: string;
  expected: string;
  actual: string;
};

const COUNTRY_ALIASES: Record<string, string> = {
  UK: "GB",
  GB: "GB",
  "UNITED KINGDOM": "GB",
  "GREAT BRITAIN": "GB",
};

export function normalizeCountry(value: string): string {
  const key = value.trim().toUpperCase();
  return COUNTRY_ALIASES[key] ?? (key.length === 2 ? key : key);
}

export function parseTargetingSpec(input: {
  targeting?: Record<string, unknown> | null;
  briefSummary?: string | null;
  briefRationale?: string | null;
  optimizationGoal?: string | null;
}): TargetingSpec {
  const targeting = input.targeting ?? {};
  const prose = targetingProse(input);
  const fromProse = parseTargetingSpecFromProse({
    targeting,
    prose,
    optimizationGoal: input.optimizationGoal,
  });
  const stored = targeting.spec;
  if (!stored || typeof stored !== "object") return fromProse;
  const spec = stored as Partial<TargetingSpec>;
  return {
    countries: (spec.countries?.length
      ? spec.countries
      : fromProse.countries
    ).map(normalizeCountry),
    age_min: spec.age_min ?? fromProse.age_min,
    age_max: spec.age_max ?? fromProse.age_max,
    interest_names: spec.interest_names?.length
      ? spec.interest_names
      : fromProse.interest_names,
    placements: spec.placements?.length ? spec.placements : fromProse.placements,
    exclude_website_visitors_days:
      spec.exclude_website_visitors_days ??
      fromProse.exclude_website_visitors_days,
    advantage_audience: Boolean(spec.advantage_audience) || fromProse.advantage_audience,
    optimization_goal:
      spec.optimization_goal ?? fromProse.optimization_goal,
  };
}

export function targetingProse(input: {
  targeting?: Record<string, unknown> | null;
  briefSummary?: string | null;
  briefRationale?: string | null;
}): string {
  const targeting = input.targeting ?? {};
  return [
    typeof targeting.notes === "string" ? targeting.notes : "",
    typeof targeting.audience === "string" ? targeting.audience : "",
    input.briefSummary ?? "",
    input.briefRationale ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

function splitInterestList(chunk: string): string[] {
  return chunk
    .split(/,|;/)
    .map((part) =>
      part
        .replace(/\b(and|including)\b/gi, "")
        .replace(/\.$/, "")
        .trim(),
    )
    .filter((name) => name.length >= 3 && !/^exclude/i.test(name));
}

function parseAgeRange(prose: string): { min: number; max: number } | null {
  const labelled = prose.match(
    /(?:age[d:]?\s*|adults aged\s*)(\d{2})\s*[–—-]\s*(\d{2})/i,
  );
  const fallback = labelled
    ? null
    : prose.match(/\b(1[8-9]|[2-5]\d)\s*[–—-]\s*([2-6]\d)\b/);
  const match = labelled ?? fallback;
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return null;
  if (min < 18 || max > 65) return null;
  return { min, max };
}

function parseTargetingSpecFromProse(input: {
  targeting: Record<string, unknown>;
  prose: string;
  optimizationGoal?: string | null;
}): TargetingSpec {
  const { targeting, prose } = input;
  const countriesRaw = Array.isArray(targeting.countries)
    ? (targeting.countries as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];
  const countries = (countriesRaw.length ? countriesRaw : []).map(
    normalizeCountry,
  );
  if (/\bUK\b|united kingdom|great britain/i.test(prose) && !countries.includes("GB")) {
    countries.push("GB");
  }

  const age = parseAgeRange(prose);
  const interest_names: string[] = [];
  const storedInterests = targeting.interests;
  if (Array.isArray(storedInterests)) {
    for (const item of storedInterests) {
      if (typeof item === "string" && item.trim().length >= 3) {
        interest_names.push(item.trim());
      }
    }
  }
  const layerMatch = prose.match(
    /interests?(?:\s+layers)?(?:\s+including)?:\s*([^.\n;]+)/i,
  );
  if (layerMatch?.[1]) {
    for (const name of splitInterestList(layerMatch[1])) {
      if (
        !interest_names.some((existing) => existing.toLowerCase() === name.toLowerCase())
      ) {
        interest_names.push(name);
      }
    }
  }

  const placements: PlacementSlot[] = [];
  if (/instagram feed|ig feed/i.test(prose)) placements.push("instagram_feed");
  if (/instagram reels|ig reels/i.test(prose)) placements.push("instagram_reels");
  if (/facebook feed|fb feed/i.test(prose)) placements.push("facebook_feed");

  let exclude_website_visitors_days: number | null = null;
  if (
    /exclude[^.]*visit/i.test(prose) ||
    /exclude existing website/i.test(prose)
  ) {
    const days = prose.match(/(\d+)\s*days?/i);
    exclude_website_visitors_days = days ? Number(days[1]) : 30;
  }

  const advantage_audience = /advantage\+/i.test(prose);
  const optimization_goal = /link click/i.test(prose)
    ? "LINK_CLICKS"
    : (input.optimizationGoal ?? "LINK_CLICKS").toUpperCase().includes("LINK")
      ? "LINK_CLICKS"
      : "LINK_CLICKS";

  return {
    countries: Array.from(new Set(countries.length ? countries : ["GB"])),
    age_min: age?.min ?? null,
    age_max: age?.max ?? null,
    interest_names,
    placements,
    exclude_website_visitors_days,
    advantage_audience,
    optimization_goal,
  };
}

export function websiteExclusionBlocker(
  spec: TargetingSpec,
): SetupBlocker | null {
  if (!spec.exclude_website_visitors_days) return null;
  return {
    ...WEBSITE_AUDIENCE_BLOCKER,
    body: `The approved brief excludes website visitors (last ${spec.exclude_website_visitors_days} days). That requires a website Custom Audience, which requires the Meta Pixel. This exclusion was not sent to Meta. Install the Pixel, create the audience, then re-sync targeting.`,
  };
}

export function advantageAudienceConflictsWithAge(spec: TargetingSpec): boolean {
  if (spec.age_min != null && spec.age_min > 25) return true;
  if (spec.age_max != null && spec.age_max < 65) return true;
  return false;
}

export function advantageAgeConflictBlocker(
  spec: TargetingSpec,
): SetupBlocker | null {
  if (!spec.advantage_audience) return null;
  if (!advantageAudienceConflictsWithAge(spec)) return null;
  return {
    ...ADVANTAGE_AGE_BLOCKER,
    body: `Meta Advantage+ audience cannot enforce age ${spec.age_min ?? 18}–${spec.age_max ?? 65} (age_max is fixed at 65 when Advantage+ is on). Age was written as a hard constraint and Advantage+ audience was turned off.`,
  };
}

export function targetingSetupBlockers(spec: TargetingSpec): SetupBlocker[] {
  return [websiteExclusionBlocker(spec), advantageAgeConflictBlocker(spec)].filter(
    (row): row is SetupBlocker => row != null,
  );
}

export function mergeSetupBlockers(
  existing: unknown,
  extra: SetupBlocker[],
): SetupBlocker[] {
  const current = Array.isArray(existing)
    ? (existing as SetupBlocker[]).filter((b) => b && typeof b.code === "string")
    : [];
  const byCode = new Map(current.map((b) => [b.code, b]));
  for (const b of extra) byCode.set(b.code, b);
  return Array.from(byCode.values());
}

function placementToGraph(spec: TargetingSpec): Pick<
  GraphTargeting,
  "publisher_platforms" | "facebook_positions" | "instagram_positions"
> {
  if (!spec.placements.length) return {};
  const publisher = new Set<string>();
  const facebook: string[] = [];
  const instagram: string[] = [];
  for (const slot of spec.placements) {
    if (slot === "facebook_feed") {
      publisher.add("facebook");
      facebook.push("feed");
    }
    if (slot === "instagram_feed") {
      publisher.add("instagram");
      instagram.push("stream");
    }
    if (slot === "instagram_reels") {
      publisher.add("instagram");
      instagram.push("reels");
    }
  }
  return {
    publisher_platforms: Array.from(publisher),
    ...(facebook.length ? { facebook_positions: Array.from(new Set(facebook)) } : {}),
    ...(instagram.length
      ? { instagram_positions: Array.from(new Set(instagram)) }
      : {}),
  };
}

/** Build the Graph targeting object. Interests must already be resolved to IDs. */
export function buildGraphTargeting(
  spec: TargetingSpec,
  interests: GraphInterest[],
): GraphTargeting {
  const graph: GraphTargeting = {
    geo_locations: {
      countries: spec.countries.length ? spec.countries : ["GB"],
    },
  };
  if (spec.age_min != null) graph.age_min = spec.age_min;
  if (spec.age_max != null) graph.age_max = spec.age_max;
  if (interests.length) {
    graph.flexible_spec = [{ interests }];
  }
  Object.assign(graph, placementToGraph(spec));
  if (spec.advantage_audience && !advantageAudienceConflictsWithAge(spec)) {
    graph.targeting_automation = { advantage_audience: 1 };
  } else if (advantageAudienceConflictsWithAge(spec)) {
    graph.targeting_automation = { advantage_audience: 0 };
  }
  return graph;
}

/** Payload QA uses names when IDs are not resolved yet. */
export function buildQaGraphTargeting(spec: TargetingSpec): GraphTargeting {
  const interests = spec.interest_names.map((name) => ({
    id: `name:${name.toLowerCase()}`,
    name,
  }));
  return buildGraphTargeting(spec, interests);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function liveInterestNames(live: Record<string, unknown>): string[] {
  const flexible = live.flexible_spec;
  if (!Array.isArray(flexible)) return [];
  const names: string[] = [];
  for (const row of flexible) {
    if (!row || typeof row !== "object") continue;
    const interests = (row as { interests?: unknown }).interests;
    if (!Array.isArray(interests)) continue;
    for (const item of interests) {
      if (item && typeof item === "object" && "name" in item) {
        const name = String((item as { name: unknown }).name ?? "").trim();
        if (name) names.push(name.toLowerCase());
      }
    }
  }
  return names;
}

export function diffGraphTargeting(params: {
  spec: TargetingSpec;
  intended: GraphTargeting;
  live: Record<string, unknown>;
  exclusionBlocked: boolean;
}): TargetingMismatch[] {
  const mismatches: TargetingMismatch[] = [];
  const liveGeo = (params.live.geo_locations ?? {}) as {
    countries?: unknown;
  };
  const liveCountries = asStringArray(liveGeo.countries)
    .map(normalizeCountry)
    .sort();
  const wantCountries = [...params.intended.geo_locations.countries]
    .map(normalizeCountry)
    .sort();
  if (liveCountries.join(",") !== wantCountries.join(",")) {
    mismatches.push({
      field: "geo_locations.countries",
      expected: wantCountries.join(", ") || "(none)",
      actual: liveCountries.join(", ") || "(none)",
    });
  }

  if (params.spec.age_min != null) {
    const liveMin = Number(params.live.age_min ?? NaN);
    if (liveMin !== params.spec.age_min) {
      mismatches.push({
        field: "age_min",
        expected: String(params.spec.age_min),
        actual: Number.isFinite(liveMin) ? String(liveMin) : "(default/unset)",
      });
    }
  }
  if (params.spec.age_max != null) {
    const liveMax = Number(params.live.age_max ?? NaN);
    if (liveMax !== params.spec.age_max) {
      mismatches.push({
        field: "age_max",
        expected: String(params.spec.age_max),
        actual: Number.isFinite(liveMax) ? String(liveMax) : "(default/unset)",
      });
    }
  }

  if (params.spec.interest_names.length || params.intended.flexible_spec?.length) {
    const liveNames = liveInterestNames(params.live);
    const expectedNames = (params.intended.flexible_spec ?? [])
      .flatMap((row) => row.interests.map((item) => item.name));
    const missing = (expectedNames.length
      ? expectedNames
      : params.spec.interest_names
    ).filter(
      (name) =>
        !liveNames.some(
          (live) =>
            live.includes(name.toLowerCase()) ||
            name.toLowerCase().includes(live),
        ),
    );
    if (missing.length) {
      mismatches.push({
        field: "flexible_spec.interests",
        expected: (expectedNames.length
          ? expectedNames
          : params.spec.interest_names
        ).join(", "),
        actual: liveNames.length ? liveNames.join(", ") : "(none)",
      });
    }
  }

  if (params.intended.publisher_platforms?.length) {
    const livePubs = asStringArray(params.live.publisher_platforms).sort();
    const want = [...params.intended.publisher_platforms].sort();
    if (livePubs.join(",") !== want.join(",")) {
      mismatches.push({
        field: "publisher_platforms",
        expected: want.join(", "),
        actual: livePubs.join(", ") || "(Advantage+ auto / unset)",
      });
    }
  }
  if (params.intended.facebook_positions?.length) {
    const livePos = asStringArray(params.live.facebook_positions).sort();
    const want = [...params.intended.facebook_positions].sort();
    if (livePos.join(",") !== want.join(",")) {
      mismatches.push({
        field: "facebook_positions",
        expected: want.join(", "),
        actual: livePos.join(", ") || "(unset)",
      });
    }
  }
  if (params.intended.instagram_positions?.length) {
    const livePos = asStringArray(params.live.instagram_positions).sort();
    const want = [...params.intended.instagram_positions].sort();
    if (livePos.join(",") !== want.join(",")) {
      mismatches.push({
        field: "instagram_positions",
        expected: want.join(", "),
        actual: livePos.join(", ") || "(unset)",
      });
    }
  }

  const wantAdv = params.intended.targeting_automation?.advantage_audience;
  if (wantAdv != null) {
    const auto = params.live.targeting_automation as
      | { advantage_audience?: number }
      | undefined;
    if (Number(auto?.advantage_audience) !== wantAdv) {
      mismatches.push({
        field: "targeting_automation.advantage_audience",
        expected: String(wantAdv),
        actual: String(auto?.advantage_audience ?? "(unset)"),
      });
    }
  }

  if (params.spec.exclude_website_visitors_days && !params.exclusionBlocked) {
    const excluded = params.live.excluded_custom_audiences;
    const has = Array.isArray(excluded) && excluded.length > 0;
    if (!has) {
      mismatches.push({
        field: "excluded_custom_audiences",
        expected: `website visitors last ${params.spec.exclude_website_visitors_days} days`,
        actual: "(none)",
      });
    }
  }

  return mismatches;
}

export type QaFinding = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
};

/** QA: intended Graph payload vs approved brief. Missing writable fields fail. */
export function qaPayloadAgainstBrief(params: {
  spec: TargetingSpec;
  payload: GraphTargeting;
  setupBlockers: SetupBlocker[];
  optimizationGoal?: string | null;
  /** Approved brief prose — required fields missing from the payload fail QA. */
  prose?: string | null;
}): QaFinding[] {
  const findings: QaFinding[] = [];
  if (params.prose) {
    findings.push(
      ...qaPayloadAgainstProse({
        prose: params.prose,
        payload: params.payload,
        setupBlockers: params.setupBlockers,
      }),
    );
  }
  const countries = params.payload.geo_locations?.countries ?? [];
  for (const country of params.spec.countries) {
    if (!countries.map(normalizeCountry).includes(normalizeCountry(country))) {
      findings.push({
        code: "payload_missing_geo",
        severity: "critical",
        message: `Payload countries ${countries.join(",") || "(none)"} missing brief geo ${country}`,
      });
    }
  }
  if (params.spec.age_min != null && params.payload.age_min !== params.spec.age_min) {
    findings.push({
      code: "payload_missing_age_min",
      severity: "critical",
      message: `Payload age_min ${params.payload.age_min ?? "(unset)"} ≠ brief ${params.spec.age_min}`,
    });
  }
  if (params.spec.age_max != null && params.payload.age_max !== params.spec.age_max) {
    findings.push({
      code: "payload_missing_age_max",
      severity: "critical",
      message: `Payload age_max ${params.payload.age_max ?? "(unset)"} ≠ brief ${params.spec.age_max}`,
    });
  }
  const payloadNames = (params.payload.flexible_spec ?? [])
    .flatMap((row) => row.interests.map((i) => i.name.toLowerCase()));
  for (const name of params.spec.interest_names) {
    if (!payloadNames.some((n) => n.includes(name.toLowerCase()) || name.toLowerCase().includes(n))) {
      findings.push({
        code: "payload_missing_interest",
        severity: "critical",
        message: `Payload flexible_spec missing interest “${name}”`,
      });
    }
  }
  if (params.spec.placements.includes("facebook_feed")) {
    if (!params.payload.facebook_positions?.includes("feed")) {
      findings.push({
        code: "payload_missing_fb_feed",
        severity: "critical",
        message: "Payload facebook_positions missing feed (brief: Facebook Feed)",
      });
    }
  }
  if (params.spec.placements.includes("instagram_feed")) {
    if (!params.payload.instagram_positions?.includes("stream")) {
      findings.push({
        code: "payload_missing_ig_feed",
        severity: "critical",
        message: "Payload instagram_positions missing stream (brief: Instagram Feed)",
      });
    }
  }
  if (params.spec.placements.includes("instagram_reels")) {
    if (!params.payload.instagram_positions?.includes("reels")) {
      findings.push({
        code: "payload_missing_ig_reels",
        severity: "critical",
        message: "Payload instagram_positions missing reels (brief: Instagram Reels)",
      });
    }
  }
  if (
    params.spec.optimization_goal === "LINK_CLICKS" &&
    params.optimizationGoal &&
    !params.optimizationGoal.toUpperCase().includes("LINK")
  ) {
    findings.push({
      code: "payload_wrong_optimization",
      severity: "critical",
      message: `Optimization goal ${params.optimizationGoal} ≠ LINK_CLICKS`,
    });
  }

  if (params.spec.exclude_website_visitors_days) {
    findings.push(
      ...qaWebsiteExclusion({
        setupBlockers: params.setupBlockers,
      }),
    );
  }
  if (
    params.payload.targeting_automation?.advantage_audience === 1 &&
    params.payload.age_max != null &&
    params.payload.age_max < 65
  ) {
    findings.push({
      code: "payload_advantage_age_conflict",
      severity: "critical",
      message:
        "Payload sets Advantage+ audience with age_max below 65. Meta rejects this; turn Advantage+ off to keep the brief age band.",
    });
  }
  if (
    params.spec.advantage_audience &&
    advantageAudienceConflictsWithAge(params.spec)
  ) {
    const named = params.setupBlockers.some(
      (b) => b.code === ADVANTAGE_AGE_BLOCKER.code,
    );
    if (!named) {
      findings.push({
        code: "advantage_age_silently_dropped",
        severity: "critical",
        message:
          "Brief asks for Advantage+ audience and a hard age band. Meta cannot honor both. Name the conflict as a setup blocker and send advantage_audience=0 with the brief ages.",
      });
    } else if (params.payload.targeting_automation?.advantage_audience !== 0) {
      findings.push({
        code: "payload_missing_advantage_opt_out",
        severity: "critical",
        message:
          "Age/Advantage+ conflict is named, but payload did not explicitly set targeting_automation.advantage_audience=0.",
      });
    } else {
      findings.push({
        code: "advantage_audience_opted_out_for_age",
        severity: "warning",
        message: ADVANTAGE_AGE_BLOCKER.title,
      });
    }
  }
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}:${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function qaWebsiteExclusion(params: {
  setupBlockers: SetupBlocker[];
}): QaFinding[] {
  const named = params.setupBlockers.some(
    (b) => b.code === WEBSITE_AUDIENCE_BLOCKER.code,
  );
  if (!named) {
    return [
      {
        code: "exclusion_silently_dropped",
        severity: "critical",
        message:
          "Brief excludes website visitors but payload has no excluded_custom_audiences and no named Pixel setup blocker.",
      },
    ];
  }
  return [
    {
      code: "exclusion_blocked_no_pixel",
      severity: "warning",
      message: WEBSITE_AUDIENCE_BLOCKER.title,
    },
  ];
}

/** Independent of TargetingSpec — catches parser misses against the approved prose. */
export function qaPayloadAgainstProse(params: {
  prose: string;
  payload: GraphTargeting;
  setupBlockers: SetupBlocker[];
}): QaFinding[] {
  const findings: QaFinding[] = [];
  const age = parseAgeRange(params.prose);
  if (age) {
    if (params.payload.age_min !== age.min) {
      findings.push({
        code: "payload_missing_age_min",
        severity: "critical",
        message: `Payload age_min ${params.payload.age_min ?? "(unset)"} ≠ brief ${age.min}`,
      });
    }
    if (params.payload.age_max !== age.max) {
      findings.push({
        code: "payload_missing_age_max",
        severity: "critical",
        message: `Payload age_max ${params.payload.age_max ?? "(unset)"} ≠ brief ${age.max}`,
      });
    }
  }
  if (
    /instagram feed|ig feed/i.test(params.prose) &&
    !params.payload.instagram_positions?.includes("stream")
  ) {
    findings.push({
      code: "payload_missing_ig_feed",
      severity: "critical",
      message: "Payload instagram_positions missing stream (brief: Instagram Feed)",
    });
  }
  if (
    /instagram reels|ig reels/i.test(params.prose) &&
    !params.payload.instagram_positions?.includes("reels")
  ) {
    findings.push({
      code: "payload_missing_ig_reels",
      severity: "critical",
      message: "Payload instagram_positions missing reels (brief: Instagram Reels)",
    });
  }
  if (
    /facebook feed|fb feed/i.test(params.prose) &&
    !params.payload.facebook_positions?.includes("feed")
  ) {
    findings.push({
      code: "payload_missing_fb_feed",
      severity: "critical",
      message: "Payload facebook_positions missing feed (brief: Facebook Feed)",
    });
  }
  const layerMatch = params.prose.match(
    /interests?(?:\s+layers)?(?:\s+including)?:\s*([^.\n;]+)/i,
  );
  if (layerMatch?.[1]) {
    const payloadNames = (params.payload.flexible_spec ?? []).flatMap((row) =>
      row.interests.map((i) => i.name.toLowerCase()),
    );
    for (const name of splitInterestList(layerMatch[1])) {
      if (
        !payloadNames.some(
          (n) => n.includes(name.toLowerCase()) || name.toLowerCase().includes(n),
        )
      ) {
        findings.push({
          code: "payload_missing_interest",
          severity: "critical",
          message: `Payload flexible_spec missing interest “${name}”`,
        });
      }
    }
  }
  if (
    (/exclude[^.]*visit/i.test(params.prose) ||
      /exclude existing website/i.test(params.prose)) &&
    !params.setupBlockers.some((b) => b.code === WEBSITE_AUDIENCE_BLOCKER.code)
  ) {
    findings.push({
      code: "exclusion_silently_dropped",
      severity: "critical",
      message:
        "Brief excludes website visitors but payload has no excluded_custom_audiences and no named Pixel setup blocker.",
    });
  }
  return findings;
}

export function formatMismatchSummary(mismatches: TargetingMismatch[]): string {
  if (!mismatches.length) return "";
  return mismatches
    .map((m) => `${m.field}: expected ${m.expected}, got ${m.actual}`)
    .join("; ");
}
