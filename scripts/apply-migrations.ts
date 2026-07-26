#!/usr/bin/env npx tsx
/**
 * Apply supabase/migrations/*.sql in order to a remote Postgres DB.
 *
 * Tracks applied files in BOTH:
 *   - public.schema_migrations (legacy, filename-based)
 *   - supabase_migrations.schema_migrations (official Supabase CLI)
 *
 * Requires either:
 *   DATABASE_URL=postgresql://postgres:...
 * or:
 *   SUPABASE_DB_PASSWORD=...  (uses pooler for project ref from NEXT_PUBLIC_SUPABASE_URL)
 *
 * Usage:
 *   npx tsx scripts/apply-migrations.ts
 *
 * For full `supabase link` + `supabase db push`, set SUPABASE_ACCESS_TOKEN
 * (Dashboard → Account → Access Tokens) then:
 *   npx supabase link --project-ref <ref> --password "$SUPABASE_DB_PASSWORD"
 *   npx supabase db push
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
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
  const region = process.env.SUPABASE_POOLER_REGION || "eu-central-1";
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:6543/postgres`;
}

function projectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  return new URL(url).hostname.split(".")[0];
}

/** Official CLI version = numeric prefix before first underscore (e.g. 00023). */
function versionFromFilename(filename: string): string {
  const m = filename.match(/^(\d+)/);
  if (!m) throw new Error(`Migration filename missing numeric prefix: ${filename}`);
  return m[1];
}

async function main() {
  loadEnvLocal();
  const cs = connectionString();
  if (!cs) {
    console.error(
      "Missing DATABASE_URL or SUPABASE_DB_PASSWORD (+ NEXT_PUBLIC_SUPABASE_URL).",
    );
    process.exit(1);
  }

  const ref = projectRef();
  if (ref) {
    const tempDir = resolve(process.cwd(), "supabase/.temp");
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(resolve(tempDir, "project-ref"), ref);
    console.log(`Wrote supabase/.temp/project-ref = ${ref}`);
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

  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text,
      created_by text,
      idempotency_key text,
      created_at timestamptz not null default now()
    );
  `);

  // Backfill official tracker from legacy filenames already applied.
  const { rows: legacy } = await client.query<{ filename: string }>(
    "select filename from public.schema_migrations order by filename",
  );
  for (const { filename } of legacy) {
    const version = versionFromFilename(filename);
    const name = filename.replace(/\.sql$/, "").replace(/^\d+_/, "");
    await client.query(
      `insert into supabase_migrations.schema_migrations (version, name)
       values ($1, $2)
       on conflict (version) do nothing`,
      [version, name],
    );
  }
  console.log(`Synced ${legacy.length} legacy rows → supabase_migrations.schema_migrations`);

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
    const version = versionFromFilename(file);
    const name = file.replace(/\.sql$/, "").replace(/^\d+_/, "");
    console.log(`apply ${file} ...`);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into public.schema_migrations (filename) values ($1)",
        [file],
      );
      await client.query(
        `insert into supabase_migrations.schema_migrations (version, name)
         values ($1, $2)
         on conflict (version) do nothing`,
        [version, name],
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
