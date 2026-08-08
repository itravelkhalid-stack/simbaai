import { afterEach, describe, expect, it, vi } from "vitest";

import { facebookProvider } from "@/lib/social/providers/facebook";
import {
  FACEBOOK_STORY_REQUIRED_SCOPES,
  getMetaPublishCapabilities,
} from "@/lib/social/meta-capabilities";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("facebook story capabilities", () => {
  it("requires the three Page Stories scopes", () => {
    expect(FACEBOOK_STORY_REQUIRED_SCOPES).toEqual([
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_show_list",
    ]);
    const ok = getMetaPublishCapabilities({
      scopes: [...FACEBOOK_STORY_REQUIRED_SCOPES],
    });
    expect(ok.canPublishFacebookStories).toBe(true);
    expect(ok.missingFacebookStoryScopes).toEqual([]);

    const missing = getMetaPublishCapabilities({
      scopes: ["pages_manage_posts"],
    });
    expect(missing.canPublishFacebookStories).toBe(false);
    expect(missing.missingFacebookStoryScopes).toContain(
      "pages_read_engagement",
    );
  });
});

describe("facebook photo_stories publish", () => {
  it("uploads unpublished photo then posts photo_stories", async () => {
    const calls: Array<{ url: string; body: URLSearchParams }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = new URLSearchParams(String(init?.body ?? ""));
      calls.push({ url, body });
      if (url.includes("/photos") && !url.includes("photo_stories")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ id: "photo_123" }),
        } as Response;
      }
      if (url.includes("/photo_stories")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ success: true, post_id: "story_999" }),
        } as Response;
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await facebookProvider.publishPost({
      accessToken: "tok",
      accountId: "page_1",
      metadata: {},
      copy: "Hello story",
      hashtags: [],
      mediaUrls: ["https://cdn.example.com/story.jpg"],
      format: "story",
      structured: {},
    });

    expect(result.platformPostId).toBe("story_999");
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toContain("/page_1/photos");
    expect(calls[0]!.body.get("published")).toBe("false");
    expect(calls[0]!.body.get("url")).toBe("https://cdn.example.com/story.jpg");
    expect(calls[1]!.url).toContain("/page_1/photo_stories");
    expect(calls[1]!.body.get("photo_id")).toBe("photo_123");
  });

  it("rejects stories without media", async () => {
    await expect(
      facebookProvider.publishPost({
        accessToken: "tok",
        accountId: "page_1",
        metadata: {},
        copy: "x",
        hashtags: [],
        mediaUrls: [],
        format: "story",
        structured: {},
      }),
    ).rejects.toThrow(/require/i);
  });
});
