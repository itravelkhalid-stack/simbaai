import { describe, expect, it } from "vitest";
import {
  findSimilarTopic,
  isNearDuplicateTopic,
  normalizeTopicText,
  topicTokenSimilarity,
} from "@/lib/content/topic-similarity";

describe("topic similarity", () => {
  it("normalizes punctuation", () => {
    expect(normalizeTopicText("Why Pay More?")).toBe("why pay more");
  });

  it("flags near-identical Why Pay More variants", () => {
    expect(
      isNearDuplicateTopic(
        "Why Pay More for Luxury Travel?",
        "Why Pay More? The Luxury Travel Myth",
      ),
    ).toBe(true);
    expect(
      isNearDuplicateTopic(
        "Luxury Travel Myth Busted",
        "The Luxury Travel Myth — Explained",
      ),
    ).toBe(true);
  });

  it("allows clearly different topics", () => {
    expect(
      isNearDuplicateTopic(
        "Packing list for Marrakech in spring",
        "Why Pay More? Luxury Travel Myth",
      ),
    ).toBe(false);
    expect(
      topicTokenSimilarity(
        "Packing list for Marrakech in spring",
        "Why Pay More? Luxury Travel Myth",
      ),
    ).toBeLessThan(0.4);
  });

  it("findSimilarTopic returns best match", () => {
    const hit = findSimilarTopic("Why Pay More for Hotels?", [
      { id: "1", title: "Sunset in Chefchaouen" },
      { id: "2", title: "Why Pay More? Travel tips" },
    ]);
    expect(hit?.id).toBe("2");
  });
});
