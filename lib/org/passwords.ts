import "server-only";

import { randomBytes } from "crypto";

/** Cryptographically strong password; never persisted in app tables. */
export function generateTemporaryPassword(bytes = 18): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Look up auth.users id by email via GoTrue admin API (service role only).
 */
export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase admin credentials");
  }

  const normalized = email.toLowerCase().trim();
  const endpoint = new URL("/auth/v1/admin/users", url);
  endpoint.searchParams.set("email", normalized);

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    // Some GoTrue versions ignore email filter and return a list — fall through.
    const text = await response.text();
    console.error("[auth-admin] user lookup failed", response.status, text);
    return null;
  }

  const body = (await response.json()) as
    | { users?: Array<{ id: string; email?: string }> }
    | { id: string; email?: string }
    | Array<{ id: string; email?: string }>;

  if (Array.isArray(body)) {
    const match = body.find((u) => u.email?.toLowerCase() === normalized);
    return match?.id ?? null;
  }

  if ("users" in body && Array.isArray(body.users)) {
    const match = body.users.find((u) => u.email?.toLowerCase() === normalized);
    return match?.id ?? null;
  }

  if ("id" in body && body.email?.toLowerCase() === normalized) {
    return body.id;
  }

  return null;
}
