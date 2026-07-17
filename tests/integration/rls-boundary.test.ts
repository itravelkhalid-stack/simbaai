/**
 * RLS boundary integration test.
 *
 * Requires a real Supabase project with migration 00018 applied and:
 *   GROWTHOS_TEST_USER_A_EMAIL / GROWTHOS_TEST_USER_A_PASSWORD
 *   GROWTHOS_TEST_USER_B_EMAIL / GROWTHOS_TEST_USER_B_PASSWORD
 *   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Skips automatically when credentials are absent.
 */

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const userA = process.env.GROWTHOS_TEST_USER_A_EMAIL;
const passA = process.env.GROWTHOS_TEST_USER_A_PASSWORD;
const userB = process.env.GROWTHOS_TEST_USER_B_EMAIL;
const passB = process.env.GROWTHOS_TEST_USER_B_PASSWORD;

const configured = Boolean(url && anon && userA && passA && userB && passB);

describe.skipIf(!configured)("RLS boundary", () => {
  it("user A cannot read org B brands", async () => {
    const clientA = createClient(url!, anon!);
    const clientB = createClient(url!, anon!);

    const { error: loginA } = await clientA.auth.signInWithPassword({
      email: userA!,
      password: passA!,
    });
    expect(loginA).toBeNull();

    const { error: loginB } = await clientB.auth.signInWithPassword({
      email: userB!,
      password: passB!,
    });
    expect(loginB).toBeNull();

    const { data: brandsB } = await clientB.from("brands").select("id, organization_id");
    expect((brandsB ?? []).length).toBeGreaterThan(0);

    const foreignOrgId = brandsB![0].organization_id;
    const { data: leaked, error } = await clientA
      .from("brands")
      .select("id")
      .eq("organization_id", foreignOrgId);

    expect(error).toBeNull();
    expect(leaked ?? []).toEqual([]);
  });
});
