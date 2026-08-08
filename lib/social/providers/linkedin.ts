import type { SocialProvider } from "@/lib/social/types";
import {
  exchangeLinkedInCode,
  fetchLinkedInMemberIdentity,
  linkedInMemberMode,
  linkedInOAuthScopeParam,
  listLinkedInOrganizations,
} from "@/lib/social/linkedin";
import { readJson, requireEnv } from "@/lib/social/providers/http";

async function registerAndUploadLinkedInImage(params: {
  accessToken: string;
  ownerUrn: string;
  imageUrl: string;
}): Promise<string> {
  const registerBody = {
    registerUploadRequest: {
      recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
      owner: params.ownerUrn,
      serviceRelationships: [
        {
          relationshipType: "OWNER",
          identifier: "urn:li:userGeneratedContent",
        },
      ],
    },
  };
  const reg = (await readJson(
    await fetch(
      "https://api.linkedin.com/v2/assets?action=registerUpload",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(registerBody),
      },
    ),
  )) as {
    value?: {
      asset?: string;
      uploadMechanism?: {
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"?: {
          uploadUrl?: string;
          headers?: Record<string, string>;
        };
      };
    };
  };

  const uploadUrl =
    reg.value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ]?.uploadUrl;
  const assetUrn = reg.value?.asset;
  if (!uploadUrl || !assetUrn) {
    throw new Error("LinkedIn image registerUpload failed");
  }

  const imgRes = await fetch(params.imageUrl);
  if (!imgRes.ok) {
    throw new Error(
      `LinkedIn image download failed (${imgRes.status}) for ${params.imageUrl}`,
    );
  }
  const bytes = Buffer.from(await imgRes.arrayBuffer());
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
  });
  if (!put.ok) {
    const text = await put.text().catch(() => "");
    throw new Error(`LinkedIn image upload failed (${put.status}): ${text}`);
  }
  return assetUrn;
}

/**
 * LinkedIn company Page posting (default).
 * OAuth for org mode creates a session + page picker; member mode connects immediately.
 * Prefer createLinkedInOAuthSession from the OAuth callback rather than exchangeCode.
 */
export const linkedinProvider: SocialProvider = {
  id: "linkedin",
  displayName: linkedInMemberMode()
    ? "LinkedIn (member)"
    : "LinkedIn Page",

  getAuthorizationUrl({ state, redirectUri }) {
    const clientId = requireEnv("LINKEDIN_CLIENT_ID");
    const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", linkedInOAuthScopeParam());
    return url.toString();
  },

  async exchangeCode({ code, redirectUri }) {
    // Fallback path (member mode or legacy). Org mode should use the picker session.
    const token = await exchangeLinkedInCode({ code, redirectUri });

    if (linkedInMemberMode()) {
      const member = await fetchLinkedInMemberIdentity(token.accessToken);
      return {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        scopes: token.scopes,
        accountId: member.personUrn,
        accountName: member.name,
        metadata: {
          author_kind: "member",
          linkedin_mode: "member",
        },
      };
    }

    const orgs = await listLinkedInOrganizations(token.accessToken);
    if (!orgs.length) {
      throw new Error(
        "No LinkedIn company Pages found. Use the LinkedIn Page picker connect flow.",
      );
    }
    // Legacy auto-pick first — prefer picker; keep for safety if exchangeCode is called
    const org = orgs[0];
    return {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      scopes: token.scopes,
      accountId: org.org_urn,
      accountName: org.org_name,
      metadata: {
        organization_id: org.org_id,
        author_kind: "organization",
        linkedin_mode: "organization",
      },
    };
  },

  async refreshToken({ refreshToken }) {
    const clientId = requireEnv("LINKEDIN_CLIENT_ID");
    const clientSecret = requireEnv("LINKEDIN_CLIENT_SECRET");
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const token = (await readJson(
      await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
    )) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? refreshToken,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scopes: token.scope?.split(" ") ?? [],
      accountId: "",
      accountName: "",
    };
  },

  async publishPost(input) {
    const commentary = [input.copy, input.hashtags.map((h) => `#${h}`).join(" ")]
      .filter(Boolean)
      .join("\n\n");

    const authorKind =
      (typeof input.metadata.author_kind === "string"
        ? input.metadata.author_kind
        : null) ||
      (input.accountId.includes("organization") ? "organization" : "member");

    if (authorKind === "member" && !linkedInMemberMode()) {
      throw new Error(
        "This LinkedIn connection is a personal profile. Reconnect LinkedIn and pick a company Page.",
      );
    }

    const mediaUrls = input.mediaUrls ?? [];
    let shareMediaCategory: "NONE" | "IMAGE" = "NONE";
    let media:
      | Array<{
          status: string;
          description: { text: string };
          media: string;
          title: { text: string };
        }>
      | undefined;

    if (mediaUrls[0]) {
      const assetUrn = await registerAndUploadLinkedInImage({
        accessToken: input.accessToken,
        ownerUrn: input.accountId,
        imageUrl: mediaUrls[0],
      });
      shareMediaCategory = "IMAGE";
      media = [
        {
          status: "READY",
          description: { text: commentary.slice(0, 200) },
          media: assetUrn,
          title: { text: "Image" },
        },
      ];
    }

    const shareContent: Record<string, unknown> = {
      shareCommentary: { text: commentary },
      shareMediaCategory,
    };
    if (media) shareContent.media = media;

    const payload = {
      author: input.accountId,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": shareContent,
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    const json = (await readJson(
      await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(payload),
      }),
    )) as { id: string };

    return { platformPostId: json.id };
  },

  async getPostMetrics({ accessToken, platformPostId }) {
    const encoded = encodeURIComponent(platformPostId);
    const url = `https://api.linkedin.com/rest/socialActions/${encoded}`;
    const json = (await readJson(
      await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "LinkedIn-Version": "202401",
        },
      }),
    )) as {
      likesSummary?: { totalLikes?: number };
      commentsSummary?: { totalFirstLevelComments?: number };
    };
    return {
      impressions: 0,
      reach: 0,
      likes: json.likesSummary?.totalLikes ?? 0,
      comments: json.commentsSummary?.totalFirstLevelComments ?? 0,
      shares: 0,
      saves: 0,
      clicks: 0,
      raw: json,
    };
  },
};
