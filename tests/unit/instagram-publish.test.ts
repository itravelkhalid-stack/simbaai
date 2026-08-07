import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildInstagramCaption,
  humanizeInstagramGraphError,
  IG_CAPTION_MAX_CHARS,
} from "@/lib/social/instagram-errors";
import { instagramProvider } from "@/lib/social/providers/instagram";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("instagram caption", () => {
  it("joins copy and hashtags", () => {
    expect(buildInstagramCaption("Hello", ["sun", "sea"])).toBe(
      "Hello\n\n#sun #sea",
    );
  });

  it("rejects captions over the limit", () => {
    expect(() =>
      buildInstagramCaption("x".repeat(IG_CAPTION_MAX_CHARS + 1), []),
    ).toThrow(/caption is/i);
  });
});

describe("instagram graph error mapping", () => {
  it("maps aspect ratio errors", () => {
    const raw = JSON.stringify({
      message: "Invalid parameter",
      code: 100,
      error_subcode: 2207009,
      error_user_msg: "The submitted image has an invalid aspect ratio.",
    });
    expect(humanizeInstagramGraphError(new Error(raw))).toMatch(
      /aspect ratio/i,
    );
  });

  it("maps non-business account errors", () => {
    const raw = JSON.stringify({
      message: "(#10) The user is not eligible",
      code: 10,
    });
    expect(humanizeInstagramGraphError(new Error(raw))).toMatch(
      /Business\/Creator/i,
    );
  });

  it("maps token errors", () => {
    const raw = JSON.stringify({
      message: "Error validating access token: session has expired",
      code: 190,
    });
    expect(humanizeInstagramGraphError(new Error(raw))).toMatch(/reconnect/i);
  });

  it("passes through unknown errors", () => {
    expect(humanizeInstagramGraphError(new Error("weird"))).toBe("weird");
  });
});

function mockGraphFetch(handlers: {
  onCreate?: (body: URLSearchParams) => { id: string };
  statusCodes?: string[];
}) {
  const created: URLSearchParams[] = [];
  let statusCalls = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (method === "HEAD") {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/jpeg" }),
      } as Response;
    }
    if (method === "POST" && url.includes("/media_publish")) {
      return {
        ok: true,
        text: async () => JSON.stringify({ id: "post_123" }),
      } as Response;
    }
    if (method === "POST" && url.includes("/media")) {
      const body = init?.body as URLSearchParams;
      created.push(body);
      const result = handlers.onCreate?.(body) ?? {
        id: `container_${created.length}`,
      };
      return {
        ok: true,
        text: async () => JSON.stringify(result),
      } as Response;
    }
    if (url.includes("fields=status_code")) {
      const code =
        handlers.statusCodes?.[
          Math.min(statusCalls++, (handlers.statusCodes?.length ?? 1) - 1)
        ] ?? "FINISHED";
      return {
        ok: true,
        text: async () => JSON.stringify({ status_code: code }),
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, created };
}

describe("instagramProvider.publishPost", () => {
  const baseInput = {
    accessToken: "tok",
    accountId: "17890",
    metadata: {},
    copy: "Post copy",
    hashtags: ["beach"],
    structured: {},
  };

  it("publishes stories with media_type=STORIES and no caption", async () => {
    const { created } = mockGraphFetch({});
    const result = await instagramProvider.publishPost({
      ...baseInput,
      mediaUrls: ["https://cdn.test/story.jpg"],
      format: "story",
      copy: "ignored for stories",
      hashtags: ["nope"],
    });
    expect(result.platformPostId).toBe("post_123");
    expect(created).toHaveLength(1);
    expect(created[0].get("media_type")).toBe("STORIES");
    expect(created[0].get("image_url")).toBe("https://cdn.test/story.jpg");
    expect(created[0].get("caption")).toBeNull();
  });

  it("publishes a single image via the container flow", async () => {
    const { created } = mockGraphFetch({});
    const result = await instagramProvider.publishPost({
      ...baseInput,
      mediaUrls: ["https://cdn.test/a.jpg"],
      format: "post",
    });
    expect(result.platformPostId).toBe("post_123");
    expect(created).toHaveLength(1);
    expect(created[0].get("image_url")).toBe("https://cdn.test/a.jpg");
    expect(created[0].get("caption")).toContain("#beach");
  });

  it("publishes carousels with child containers", async () => {
    const { created } = mockGraphFetch({});
    const result = await instagramProvider.publishPost({
      ...baseInput,
      mediaUrls: ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"],
      format: "carousel",
    });
    expect(result.platformPostId).toBe("post_123");
    // 2 children + 1 carousel container
    expect(created).toHaveLength(3);
    expect(created[0].get("is_carousel_item")).toBe("true");
    expect(created[2].get("media_type")).toBe("CAROUSEL");
    expect(created[2].get("children")).toBe("container_1,container_2");
  });

  it("rejects video formats with a clear error", async () => {
    mockGraphFetch({});
    await expect(
      instagramProvider.publishPost({
        ...baseInput,
        mediaUrls: ["https://cdn.test/a.jpg"],
        format: "reel_script",
      }),
    ).rejects.toThrow(/not yet supported/i);
  });

  it("rejects video URLs with a clear error", async () => {
    mockGraphFetch({});
    await expect(
      instagramProvider.publishPost({
        ...baseInput,
        mediaUrls: ["https://cdn.test/clip.mp4"],
        format: "post",
      }),
    ).rejects.toThrow(/video publishing is not yet supported/i);
  });

  it("surfaces container processing errors", async () => {
    mockGraphFetch({ statusCodes: ["ERROR"] });
    await expect(
      instagramProvider.publishPost({
        ...baseInput,
        mediaUrls: ["https://cdn.test/a.jpg"],
        format: "post",
      }),
    ).rejects.toThrow(/ERROR|processing/i);
  });

  it("rejects single-image carousels", async () => {
    mockGraphFetch({});
    await expect(
      instagramProvider.publishPost({
        ...baseInput,
        mediaUrls: ["https://cdn.test/a.jpg"],
        format: "carousel",
      }),
    ).rejects.toThrow(/at least 2/i);
  });
});
