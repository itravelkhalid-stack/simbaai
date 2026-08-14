import { describe, expect, it } from "vitest";

import {
  WEBSITE_AUDIENCE_BLOCKER,
  buildGraphTargeting,
  buildQaGraphTargeting,
  diffGraphTargeting,
  interestSearchQueries,
  parseTargetingSpec,
  pickAdInterest,
  qaPayloadAgainstBrief,
  targetingSetupBlockers,
} from "@/lib/ads/meta-targeting";

const DUBAI_NOTES =
  "Advantage+ Audience with interest guardrails. UK only. Placements Instagram Feed, Instagram Reels, Facebook Feed. Optimise link clicks. Exclude anyone who visited madyen.com last 30 days. Age 25–54. No dayparting.";
const DUBAI_AUDIENCE =
  "UK 25–54; interests: luxury travel, Dubai, UAE travel, resort holidays, beach holidays, international travel, holiday deals; exclude existing website visitors.";

describe("Meta targeting spec from approved brief", () => {
  it("parses age, interests, placements, geo, and website exclusion", () => {
    const spec = parseTargetingSpec({
      targeting: {
        countries: ["GB"],
        notes: DUBAI_NOTES,
        audience: DUBAI_AUDIENCE,
      },
    });
    expect(spec.countries).toEqual(["GB"]);
    expect(spec.age_min).toBe(25);
    expect(spec.age_max).toBe(54);
    expect(spec.interest_names).toEqual([
      "luxury travel",
      "Dubai",
      "UAE travel",
      "resort holidays",
      "beach holidays",
      "international travel",
      "holiday deals",
    ]);
    expect(spec.placements).toEqual([
      "instagram_feed",
      "instagram_reels",
      "facebook_feed",
    ]);
    expect(spec.exclude_website_visitors_days).toBe(30);
    expect(spec.advantage_audience).toBe(true);
    expect(spec.optimization_goal).toBe("LINK_CLICKS");
  });

  it("builds a Graph payload with age, flexible_spec, and manual placements", () => {
    const spec = parseTargetingSpec({
      targeting: { countries: ["GB"], notes: DUBAI_NOTES, audience: DUBAI_AUDIENCE },
    });
    const payload = buildQaGraphTargeting(spec);
    expect(payload.age_min).toBe(25);
    expect(payload.age_max).toBe(54);
    expect(payload.geo_locations.countries).toEqual(["GB"]);
    expect(payload.facebook_positions).toEqual(["feed"]);
    expect(payload.instagram_positions).toEqual(["stream", "reels"]);
    expect(payload.publisher_platforms).toEqual(
      expect.arrayContaining(["facebook", "instagram"]),
    );
    expect(payload.flexible_spec?.[0]?.interests.map((i) => i.name)).toEqual(
      spec.interest_names,
    );
    expect(payload.targeting_automation).toEqual({ advantage_audience: 0 });
  });
});

describe("QA payload vs approved brief", () => {
  it("fails when the Graph payload is geo-only", () => {
    const spec = parseTargetingSpec({
      targeting: { countries: ["GB"], notes: DUBAI_NOTES, audience: DUBAI_AUDIENCE },
    });
    const findings = qaPayloadAgainstBrief({
      spec,
      payload: { geo_locations: { countries: ["GB"] } },
      setupBlockers: [],
      prose: `${DUBAI_NOTES}\n${DUBAI_AUDIENCE}`,
    });
    const critical = findings.filter((f) => f.severity === "critical");
    expect(critical.map((f) => f.code)).toEqual(
      expect.arrayContaining([
        "payload_missing_age_min",
        "payload_missing_age_max",
        "payload_missing_interest",
        "payload_missing_fb_feed",
        "payload_missing_ig_feed",
        "payload_missing_ig_reels",
        "exclusion_silently_dropped",
      ]),
    );
  });

  it("passes writable fields when payload matches the brief and names the Pixel blocker", () => {
    const spec = parseTargetingSpec({
      targeting: { countries: ["GB"], notes: DUBAI_NOTES, audience: DUBAI_AUDIENCE },
    });
    const blockers = targetingSetupBlockers(spec);
    expect(blockers.map((b) => b.code)).toEqual(
      expect.arrayContaining([
        WEBSITE_AUDIENCE_BLOCKER.code,
        "meta_advantage_audience_age_conflict",
      ]),
    );
    const findings = qaPayloadAgainstBrief({
      spec,
      payload: buildQaGraphTargeting(spec),
      setupBlockers: blockers,
      optimizationGoal: "LINK_CLICKS",
      prose: `${DUBAI_NOTES}\n${DUBAI_AUDIENCE}`,
    });
    expect(findings.filter((f) => f.severity === "critical")).toEqual([]);
    expect(findings.some((f) => f.code === "exclusion_blocked_no_pixel")).toBe(
      true,
    );
    expect(
      findings.some((f) => f.code === "advantage_audience_opted_out_for_age"),
    ).toBe(true);
  });
});

describe("post-create live ad set diff", () => {
  it("flags the live 18–65 empty-interest payload against the Dubai brief", () => {
    const spec = parseTargetingSpec({
      targeting: { countries: ["GB"], notes: DUBAI_NOTES, audience: DUBAI_AUDIENCE },
    });
    const intended = buildGraphTargeting(spec, [
      { id: "1", name: "luxury travel" },
      { id: "2", name: "Dubai" },
    ]);
    const mismatches = diffGraphTargeting({
      spec,
      intended,
      live: {
        geo_locations: { countries: ["GB"] },
        age_min: 18,
        age_max: 65,
        targeting_automation: { advantage_audience: 1 },
      },
      exclusionBlocked: true,
    });
    expect(mismatches.map((m) => m.field)).toEqual(
      expect.arrayContaining([
        "age_min",
        "age_max",
        "flexible_spec.interests",
        "publisher_platforms",
        "facebook_positions",
        "instagram_positions",
        "targeting_automation.advantage_audience",
      ]),
    );
    expect(mismatches.some((m) => m.field === "excluded_custom_audiences")).toBe(
      false,
    );
  });
});

describe("ad interest matching", () => {
  it("does not pick a competitor brand for beach holidays", () => {
    expect(
      pickAdInterest("beach holidays", [
        { id: "1", name: "On The Beach Holidays" },
        { id: "2", name: "Resort (travel and tourism business)" },
      ]),
    ).toBeNull();
  });

  it("maps UAE travel via alias list", () => {
    expect(interestSearchQueries("UAE travel")).toEqual([
      "UAE travel",
      "United Arab Emirates",
    ]);
  });
});
