#!/usr/bin/env npx tsx
/**
 * Apply supabase/migrations/*.sql in order to a remote Postgres DB.
 *
 * Requires either:
 *   DATABASE_URL=postgresql://postgres:...
 * or:
 *   SUPABASE_DB_PASSWORD=...  (uses db.<project-ref>.supabase.co)
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD='your-db-password' npx tsx scripts/apply-migrations.ts
 */

import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import pg from "pg";

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const i = trimmed.indexOf("=");
      const k = trimmed.slice(0, i);
      const v = trimmed.slice(i + 1);
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    // ignore
  }
}

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!password || !url) return null;
  const ref = new URL(url).hostname.split(".")[0];
  // Prefer pooler (direct db.<ref>.supabase.co is often IPv6-only / unresolved)
  const region = process.env.SUPABASE_POOLER_REGION || "eu-central-1";
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:6543/postgres`;
}

async function main() {
  loadEnvLocal();
  const cs = connectionString();
  if (!cs) {
    console.error(
      "Missing DATABASE_URL or SUPABASE_DB_PASSWORD (+ NEXT_PUBLIC_SUPABASE_URL).",
    );
    console.error(
      "Find the DB password in Supabase → Project Settings → Database.",
    );
    process.exit(1);
  }

  const dir = resolve(process.cwd(), "supabase/migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = new pg.Client({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  await client.query(`
    create table if not exists public.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  for (const file of files) {
    const { rows } = await client.query(
      "select 1 from public.schema_migrations where filename = $1",
      [file],
    );
    if (rows.length) {
      console.log(`skip ${file}`);
      continue;
    }
    const sql = readFileSync(resolve(dir, file), "utf8");
    console.log(`apply ${file} ...`);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into public.schema_migrations (filename) values ($1)",
        [file],
      );
      await client.query("commit");
      console.log(`  ok ${file}`);
    } catch (err) {
      await client.query("rollback");
      console.error(`  FAILED ${file}`);
      throw err;
    }
  }

  await client.end();
  console.log("All migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
