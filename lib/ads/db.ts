import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Untyped accessor for tables added in 00046 before Database types are regenerated.
 */
export function adsTable(supabase: SupabaseClient, table: string) {
  // Tables not yet in generated Database types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from(table);
}
