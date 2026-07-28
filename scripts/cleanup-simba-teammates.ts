/**
 * One-off prod cleanup:
 * - Ensure barbraregina232@gmail.com and rodgerswambua09@gmail.com are simba members
 * - Delete non-simba orgs they solely own (accidental create-org)
 *
 * Usage: npx tsx scripts/cleanup-simba-teammates.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";

import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const k = trimmed.slice(0, i);
    const v = trimmed.slice(i + 1);
    if (!process.env[k]) process.env[k] = v;
  }
}

async function findUserIdByEmail(
  url: string,
  key: string,
  email: string,
): Promise<string | null> {
  const endpoint = new URL("/auth/v1/admin/users", url);
  endpoint.searchParams.set("email", email.toLowerCase());
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
  });
  if (!response.ok) {
    console.error("lookup failed", email, await response.text());
    return null;
  }
  const body = await response.json();
  const users = Array.isArray(body)
    ? body
    : Array.isArray(body.users)
      ? body.users
      : body.id
        ? [body]
        : [];
  const match = users.find(
    (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  return match?.id ?? null;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: simba, error: simbaError } = await admin
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", "simba")
    .single();

  if (simbaError || !simba) {
    throw new Error(`simba org not found: ${simbaError?.message}`);
  }

  const emails = [
    "barbraregina232@gmail.com",
    "rodgerswambua09@gmail.com",
  ];

  for (const email of emails) {
    const userId = await findUserIdByEmail(url, key, email);
    if (!userId) {
      console.log("MISSING_USER", email);
      continue;
    }
    console.log("USER", email, userId);

    const { data: memberships } = await admin
      .from("organization_members")
      .select("id, organization_id, role, status, organizations(id, name, slug)")
      .eq("user_id", userId);

    console.log(
      "MEMBERSHIPS",
      email,
      (memberships ?? []).map((m) => ({
        org: (m.organizations as { slug?: string } | null)?.slug,
        role: m.role,
        status: m.status,
      })),
    );

    const onSimba = (memberships ?? []).some(
      (m) => m.organization_id === simba.id && m.status === "active",
    );

    if (!onSimba) {
      const { error } = await admin.from("organization_members").insert({
        organization_id: simba.id,
        user_id: userId,
        role: "org_member",
        status: "active",
      });
      if (error) console.error("ADD_SIMBA_FAILED", email, error.message);
      else console.log("ADDED_TO_SIMBA", email);
    } else {
      console.log("ALREADY_ON_SIMBA", email);
    }

    // Delete stray orgs where this user is the only owner and slug !== simba
    for (const m of memberships ?? []) {
      const rawOrg = m.organizations as
        | { id: string; slug: string; name: string }
        | { id: string; slug: string; name: string }[]
        | null;
      const org = Array.isArray(rawOrg) ? rawOrg[0] : rawOrg;
      if (!org || org.slug === "simba") continue;
      if (m.role !== "org_owner") continue;

      const { count } = await admin
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("role", "org_owner")
        .eq("status", "active");

      if ((count ?? 0) !== 1) {
        console.log("SKIP_ORG_MULTI_OWNER", org.slug, count);
        continue;
      }

      // Also skip if other active members exist beyond this user (be conservative: only delete solo orgs)
      const { count: memberCount } = await admin
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("status", "active");

      if ((memberCount ?? 0) > 1) {
        console.log("SKIP_ORG_HAS_OTHERS", org.slug, memberCount);
        continue;
      }

      const { error: delError } = await admin
        .from("organizations")
        .delete()
        .eq("id", org.id);

      if (delError) console.error("DELETE_ORG_FAILED", org.slug, delError.message);
      else console.log("DELETED_STRAY_ORG", org.slug, org.name);
    }
  }

  // Final membership check
  for (const email of emails) {
    const userId = await findUserIdByEmail(url, key, email);
    if (!userId) continue;
    const { data } = await admin
      .from("organization_members")
      .select("role, status, organizations(slug, name)")
      .eq("user_id", userId)
      .eq("organization_id", simba.id);
    console.log("FINAL_SIMBA", email, data);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
