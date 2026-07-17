#!/usr/bin/env npx tsx
/**
 * Prints / optionally runs the RLS audit.
 *
 *   npx tsx scripts/audit-rls.ts
 *   DATABASE_URL=postgres://... npx tsx scripts/audit-rls.ts --execute
 *
 * Prefer: psql "$DATABASE_URL" -f scripts/audit-rls.sql
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const sqlPath = resolve(__dirname, "audit-rls.sql");
const sql = readFileSync(sqlPath, "utf8");

async function main() {
  const execute = process.argv.includes("--execute");
  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

  if (!execute || !databaseUrl) {
    console.log(sql);
    console.log(
      "\n# Tip: psql \"$DATABASE_URL\" -f scripts/audit-rls.sql\n# Or: DATABASE_URL=... npx tsx scripts/audit-rls.ts --execute\n",
    );
    return;
  }

  // Dynamic import so vitest/build don't require `pg` unless executing.
  const { default: pg } = await import("pg").catch(() => {
    throw new Error("Install `pg` to execute against a database: npm i -D pg");
  });

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(sql);
    const lacking = result.rows.filter(
      (r: { status: string }) => r.status !== "OK",
    );
    console.table(result.rows);
    if (lacking.length) {
      console.error(`\n${lacking.length} table(s) need attention.`);
      process.exit(1);
    }
    console.log("\nAll public tables have RLS + policies.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
