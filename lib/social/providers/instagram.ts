import type { SocialProvider } from "@/lib/social/types";
import { getMetaOAuthScopeParam } from "@/lib/social/meta-scopes";
import {
  assertPublicImageUrl,
  buildInstagramCaption,
  humanizeInstagramGraphError,
  IG_CAROUSEL_MAX,
  IG_CAROUSEL_MIN,
} from "@/lib/social/instagram-errors";
import { readJson, requireEnv } from "@/lib/social/providers/http";

const GRAPH = "https://graph.facebook.com/v21.0";
const CONTAINER_POLL_INTERVAL_MS = 3_000;
const CONTAINER_POLL_MAX_ATTEMPTS = 20;

const VIDEO_URL_PATTERN = /\.(mp4|mov|webm|m4v)(\?|$)/i;
const VIDEO_FORMATS = new Set(["reel_script", "short_script"]);

type ContainerStatus = {
  status_code?: "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";
  status?: string;
  id?: string;
};

async function graphPost(path: string, body: URLSearchParams) {
  return (await readJson(
    await fetch(`${GRAPH}/${path}`, { method: "POST", body }),
  )) as { id: string };
}

/**
 * Poll a media container until Instagram finishes processing it.
 * Publishing before FINISHED returns "Media ID is not available".
 */
async function waitForContainer(containerId: string, accessToken: string) {
  for (let attempt = 0; attempt < CONTAINER_POLL_MAX_ATTEMPTS; attempt++) {
    const url = new URL(`${GRAPH}/${containerId}`);
    url.searchParams.set("fields", "status_code,status");
    url.searchParams.set("access_token", accessToken);
    const status = (await readJson(await fetch(url))) as ContainerStatus;

    if (status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(
        status.status ||
          `Instagram media container ${status.status_code ?? "failed"} during processing`,
      );
    }
    await new Promise((resolve) =>
      setTimeout(resolve, CONTAINER_POLL_INTERVAL_MS),
    );
  }
  throw new Error(
    "Instagram media container did not finish processing in time — try publishing again in a minute.",
  );
}

function assertNoVideo(input: { mediaUrls: string[]; format: string }) {
  if (VIDEO_FORMATS.has(input.format)) {
    throw new Error(
      "Instagram Reels/video publishing is not yet supported — only feed images and carousels. Convert this item to an image post or publish the video manually.",
    );
  }
  const video = input.mediaUrls.find((u) => VIDEO_URL_PATTERN.test(u));
  if (video) {
    throw new Error(
      `Instagram video publishing is not yet supported (found ${video}). Attach images only, or publish the video manually.`,
    );
  }
}

/**
 * Instagram Business via Meta Graph.
 * Connect + page/IG selection is handled by the Meta page picker flow.
 * Publish uses the container flow: create → poll status → publish.
 */
export const instagramProvider: SocialProvider = {
  id: "instagram",
  displayName: "Instagram Business",
  covers: ["instagram"],

  getAuthorizationUrl({ state, redirectUri }) {
    const clientId = requireEnv("META_APP_ID");
    const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set(
      "scope",
      getMetaOAuthScopeParam(process.env.META_REQUEST_IG_SCOPES === "true"),
    );
    url.searchParams.set("response_type", "code");
    return url.toString();
  },

  async exchangeCode() {
    throw new Error(
      "Instagram connect uses the Meta page picker flow — do not call exchangeCode directly",
    );
  },

  async refreshToken() {
    throw new Error("Reconnect Instagram via OAuth when the token expires");
  },

  async publishPost(input) {
    const caps = input.metadata?.capabilities as
      | { canPublishInstagram?: boolean }
      | undefined;
    if (caps && caps.canPublishInstagram === false) {
      throw new Error(
        "This Meta connection cannot publish to Instagram (missing Instagram permissions). Reconnect Meta with Instagram scopes enabled.",
      );
    }

    try {
      assertNoVideo(input);
      const caption = buildInstagramCaption(input.copy, input.hashtags);

      const images = input.mediaUrls.filter(Boolean);
      if (!images.length) {
        throw new Error(
          "Instagram publishing requires at least one publicly reachable image URL. Attach media from the brand library.",
        );
      }

      const useCarousel = input.format === "carousel" || images.length > 1;
      if (useCarousel) {
        if (images.length < IG_CAROUSEL_MIN) {
          throw new Error(
            `Instagram carousels need at least ${IG_CAROUSEL_MIN} images — this item has ${images.length}. Attach more media or switch the format to a single post.`,
          );
        }
        if (images.length > IG_CAROUSEL_MAX) {
          throw new Error(
            `Instagram carousels support at most ${IG_CAROUSEL_MAX} images — this item has ${images.length}. Remove some media.`,
          );
        }
      }

      for (const url of images) {
        await assertPublicImageUrl(url);
      }

      let creationId: string;
      if (useCarousel) {
        const childIds: string[] = [];
        for (const url of images) {
          const child = await graphPost(
            `${input.accountId}/media`,
            new URLSearchParams({
              image_url: url,
              is_carousel_item: "true",
              access_token: input.accessToken,
            }),
          );
          childIds.push(child.id);
        }
        for (const childId of childIds) {
          await waitForContainer(childId, input.accessToken);
        }

        const carousel = await graphPost(
          `${input.accountId}/media`,
          new URLSearchParams({
            media_type: "CAROUSEL",
            children: childIds.join(","),
            caption,
            access_token: input.accessToken,
          }),
        );
        creationId = carousel.id;
      } else {
        const created = await graphPost(
          `${input.accountId}/media`,
          new URLSearchParams({
            image_url: images[0],
            caption,
            access_token: input.accessToken,
          }),
        );
        creationId = created.id;
      }

      await waitForContainer(creationId, input.accessToken);

      const published = await graphPost(
        `${input.accountId}/media_publish`,
        new URLSearchParams({
          creation_id: creationId,
          access_token: input.accessToken,
        }),
      );

      return { platformPostId: published.id };
    } catch (error) {
      throw new Error(humanizeInstagramGraphError(error));
    }
  },

  async getPostMetrics({ accessToken, platformPostId }) {
    // `views` superseded `impressions` for IG media in newer Graph versions;
    // fall back to impressions for media/versions that still use it.
    const fetchInsights = async (metricList: string) => {
      const url = new URL(`${GRAPH}/${platformPostId}/insights`);
      url.searchParams.set("metric", metricList);
      url.searchParams.set("access_token", accessToken);
      return (await readJson(await fetch(url))) as {
        data?: Array<{ name: string; values?: Array<{ value: number }> }>;
      };
    };

    let json: {
      data?: Array<{ name: string; values?: Array<{ value: number }> }>;
    };
    try {
      json = await fetchInsights("views,reach,likes,comments,shares,saved");
    } catch {
      json = await fetchInsights(
        "impressions,reach,likes,comments,shares,saved",
      );
    }

    const map = new Map(
      (json.data ?? []).map((row) => [row.name, row.values?.[0]?.value ?? 0]),
    );
    return {
      impressions: map.get("views") ?? map.get("impressions") ?? 0,
      reach: map.get("reach") ?? 0,
      likes: map.get("likes") ?? 0,
      comments: map.get("comments") ?? 0,
      shares: map.get("shares") ?? 0,
      saves: map.get("saved") ?? 0,
      clicks: 0,
      raw: json,
    };
  },

  async getAccountFollowers({ accessToken, accountId }) {
    const url = new URL(`${GRAPH}/${accountId}`);
    url.searchParams.set("fields", "followers_count,username");
    url.searchParams.set("access_token", accessToken);
    try {
      const json = (await readJson(await fetch(url))) as {
        followers_count?: number;
        username?: string;
      };
      return {
        followers: Number(json.followers_count ?? 0),
        raw: json as Record<string, unknown>,
      };
    } catch (error) {
      throw new Error(humanizeInstagramGraphError(error));
    }
  },
};
