import type { SocialProvider } from "@/lib/social/types";
import { readJson, requireEnv } from "@/lib/social/providers/http";

/**
 * Default: company Page (organization) posting.
 * Set LINKEDIN_MEMBER_MODE=true only if you need personal-profile posting instead.
 */
function linkedInMemberMode() {
  return process.env.LINKEDIN_MEMBER_MODE === "true";
}

/** Base OpenID scopes (always). */
const BASE_SCOPES = ["openid", "profile", "w_member_social"] as const;

/**
 * Org / company Page scopes — need Community Management API products on the LinkedIn app.
 */
const ORG_SCOPES = [
  "rw_organization_admin",
  "w_organization_social",
  "r_organization_social",
] as const;

function linkedInOAuthScopeParam() {
  if (linkedInMemberMode()) {
    return BASE_SCOPES.join(" ");
  }
  return [...BASE_SCOPES, ...ORG_SCOPES].join(" ");
}

async function fetchMemberIdentity(accessToken: string): Promise<{
  personUrn: string;
  name: string;
}> {
  try {
    const userinfo = (await readJson(
      await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    )) as {
      sub?: string;
      name?: string;
      given_name?: string;
      family_name?: string;
    };
    if (userinfo.sub) {
      const personId = userinfo.sub.includes(":")
        ? userinfo.sub.split(":").pop()!
        : userinfo.sub;
      const name =
        userinfo.name ||
        [userinfo.given_name, userinfo.family_name].filter(Boolean).join(" ") ||
        `LinkedIn member ${personId}`;
      return {
        personUrn: userinfo.sub.startsWith("urn:")
          ? userinfo.sub
          : `urn:li:person:${personId}`,
        name,
      };
    }
  } catch {
    // fall through to /v2/me
  }

  const me = (await readJson(
    await fetch("https://api.linkedin.com/v2/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  )) as {
    id: string;
    localizedFirstName?: string;
    localizedLastName?: string;
  };
  const name =
    [me.localizedFirstName, me.localizedLastName].filter(Boolean).join(" ") ||
    `LinkedIn member ${me.id}`;
  return { personUrn: `urn:li:person:${me.id}`, name };
}

async function fetchOrganizationTarget(accessToken: string): Promise<{
  orgUrn: string;
  orgId: string;
  name: string;
}> {
  const orgs = (await readJson(
    await fetch(
      "https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    ),
  )) as {
    elements?: Array<{ organizationalTarget?: string }>;
  };

  const orgUrn = orgs.elements?.[0]?.organizationalTarget;
  if (!orgUrn) {
    throw new Error(
      "No LinkedIn company Pages found where you are an approved administrator. Make sure you admin a Page, and that Community Management / organization products are enabled on the LinkedIn app.",
    );
  }
  const orgId = orgUrn.split(":").pop()!;
  const org = (await readJson(
    await fetch(`https://api.linkedin.com/v2/organizations/${orgId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  )) as { localizedName?: string };

  return {
    orgUrn,
    orgId,
    name: org.localizedName || `LinkedIn org ${orgId}`,
  };
}

/** LinkedIn company Page posting (default). Member mode via LINKEDIN_MEMBER_MODE=true. */
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
    const clientId = requireEnv("LINKEDIN_CLIENT_ID");
    const clientSecret = requireEnv("LINKEDIN_CLIENT_SECRET");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
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

    const scopes = token.scope?.split(" ").filter(Boolean) ?? [
      ...BASE_SCOPES,
    ];

    if (linkedInMemberMode()) {
      const member = await fetchMemberIdentity(token.access_token);
      return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        expiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000)
          : null,
        scopes,
        accountId: member.personUrn,
        accountName: member.name,
        metadata: {
          author_kind: "member",
          linkedin_mode: "member",
        },
      };
    }

    const org = await fetchOrganizationTarget(token.access_token);
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scopes,
      accountId: org.orgUrn,
      accountName: org.name,
      metadata: {
        organization_id: org.orgId,
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
        "This LinkedIn connection is a personal profile. Reconnect LinkedIn to link a company Page (default), or set LINKEDIN_MEMBER_MODE=true for personal posting.",
      );
    }

    const payload = {
      author: input.accountId,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: commentary },
          shareMediaCategory: "NONE",
        },
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
