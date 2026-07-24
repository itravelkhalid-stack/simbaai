import { readJson, requireEnv } from "@/lib/social/providers/http";
import type { LinkedInOrgOption } from "@/lib/social/linkedin-types";

export type { LinkedInOrgOption } from "@/lib/social/linkedin-types";

export function linkedInMemberMode() {
  return process.env.LINKEDIN_MEMBER_MODE === "true";
}

const BASE_SCOPES = ["openid", "profile", "w_member_social"] as const;
const ORG_SCOPES = [
  "rw_organization_admin",
  "w_organization_social",
  "r_organization_social",
] as const;

export function linkedInOAuthScopeParam() {
  if (linkedInMemberMode()) {
    return BASE_SCOPES.join(" ");
  }
  return [...BASE_SCOPES, ...ORG_SCOPES].join(" ");
}

export async function exchangeLinkedInCode(params: {
  code: string;
  redirectUri: string;
}): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
}> {
  const clientId = requireEnv("LINKEDIN_CLIENT_ID");
  const clientSecret = requireEnv("LINKEDIN_CLIENT_SECRET");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
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
    refreshToken: token.refresh_token ?? null,
    expiresAt: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000)
      : null,
    scopes: token.scope?.split(" ").filter(Boolean) ?? [...BASE_SCOPES],
  };
}

export async function fetchLinkedInMemberIdentity(accessToken: string): Promise<{
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
    // fall through
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

/** List company Pages the member administers (for picker UI). */
export async function listLinkedInOrganizations(
  accessToken: string,
): Promise<LinkedInOrgOption[]> {
  const acls = (await readJson(
    await fetch(
      "https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    ),
  )) as {
    elements?: Array<{ organizationalTarget?: string }>;
  };

  const urns = (acls.elements ?? [])
    .map((e) => e.organizationalTarget)
    .filter((u): u is string => Boolean(u));

  if (!urns.length) {
    return [];
  }

  const options: LinkedInOrgOption[] = [];
  for (const orgUrn of urns) {
    const orgId = orgUrn.split(":").pop()!;
    try {
      const org = (await readJson(
        await fetch(`https://api.linkedin.com/v2/organizations/${orgId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      )) as { localizedName?: string };
      options.push({
        org_id: orgId,
        org_urn: orgUrn,
        org_name: org.localizedName || `LinkedIn Page ${orgId}`,
      });
    } catch {
      options.push({
        org_id: orgId,
        org_urn: orgUrn,
        org_name: `LinkedIn Page ${orgId}`,
      });
    }
  }

  return options;
}
