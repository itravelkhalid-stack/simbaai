import { describe, expect, it } from "vitest";

import {
  extractUrlsFromText,
  findDisallowedUrls,
  urlAllowedByList,
} from "@/lib/content/link-allowlist-core";
import {
  canDeriveStoryFit,
  formatSlotForContent,
  suitableFormatsForDimensions,
} from "@/lib/media/format-fit";

describe("link allowlist", () => {
  const allow = [
    "https://madyen.com",
    "https://madyen.com/terms",
    "https://shop.madyen.com/kits",
  ];

  it("extracts and strips trailing punctuation", () => {
    expect(
      extractUrlsFromText("See https://madyen.com/shop), and more."),
    ).toEqual(["https://madyen.com/shop"]);
  });

  it("allows website root and path prefixes", () => {
    expect(urlAllowedByList("https://www.madyen.com/any/page", allow)).toBe(
      true,
    );
    expect(urlAllowedByList("https://madyen.com/terms/privacy", allow)).toBe(
      true,
    );
    expect(urlAllowedByList("https://shop.madyen.com/kits/a", allow)).toBe(
      true,
    );
  });

  it("blocks invented hosts and off-allowlist paths under subdomain entries", () => {
    expect(urlAllowedByList("https://blog.fake-madyen.com/x", allow)).toBe(
      false,
    );
    expect(
      findDisallowedUrls(
        "Check https://madyen.com/invented-landing-xyz and https://evil.test",
        ["https://madyen.com/terms"],
      ),
    ).toContain("https://evil.test");
    // Website-root allow permits any path on host
    expect(
      findDisallowedUrls("https://madyen.com/invented", [
        "https://madyen.com",
      ]),
    ).toEqual([]);
  });

  it("treats any URL as disallowed when allowlist empty", () => {
    expect(findDisallowedUrls("https://example.com", [])).toEqual([
      "https://example.com",
    ]);
  });
});

describe("format fit", () => {
  it("classifies story 9:16", () => {
    expect(suitableFormatsForDimensions(1080, 1920)).toContain(
      "instagram_story",
    );
    expect(suitableFormatsForDimensions(1080, 1350)).toContain(
      "instagram_feed",
    );
    expect(suitableFormatsForDimensions(1200, 628)).toEqual(
      expect.arrayContaining(["facebook_feed", "linkedin_feed"]),
    );
  });

  it("maps platform/format to slots", () => {
    expect(formatSlotForContent("instagram", "story")).toBe("instagram_story");
    expect(formatSlotForContent("linkedin", "feed")).toBe("linkedin_feed");
  });

  it("allows derive for large enough sources", () => {
    expect(canDeriveStoryFit(800, 600)).toBe(true);
    expect(canDeriveStoryFit(100, 100)).toBe(false);
  });
});
