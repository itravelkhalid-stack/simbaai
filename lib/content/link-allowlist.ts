import "server-only";

/**
 * Brand link allowlist: website root, product URLs, and brands.allowed_link_urls.
 * Content may only include URLs under these prefixes (same registrable host + path).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractUrlsFromText,
  findDisallowedUrls,
  urlAllowedByList,
} from "@/lib/content/link-allowlist-core";

export {
  extractUrlsFromText,
  findDisallowedUrls,
  urlAllowedByList,
} from "@/lib/content/link-allowlist-core";

export async function loadBrandLinkAllowlist(params: {
  organizationId: string;
  brandId: string;
}): Promise<string[]> {
  const supabase = createAdminClient();
  const [{ data: brand }, { data: products }, { data: profile }] =
    await Promise.all([
      supabase
        .from("brands")
        .select("website, allowed_link_urls")
        .eq("id", params.brandId)
        .eq("organization_id", params.organizationId)
        .maybeSingle(),
      supabase
        .from("brand_products")
        .select("url")
        .eq("brand_id", params.brandId)
        .eq("organization_id", params.organizationId)
        .not("url", "is", null)
        .limit(100),
      supabase
        .from("compliance_profiles")
        .select("terms_urls")
        .eq("brand_id", params.brandId)
        .eq("organization_id", params.organizationId)
        .maybeSingle(),
    ]);

  const list: string[] = [];
  if (brand?.website) list.push(String(brand.website));
  for (const u of (brand?.allowed_link_urls as string[] | null) ?? []) {
    if (u?.trim()) list.push(u.trim());
  }
  for (const p of products ?? []) {
    if (p.url?.trim()) list.push(p.url.trim());
  }
  for (const u of (profile?.terms_urls as string[] | null) ?? []) {
    if (u?.trim()) list.push(u.trim());
  }
  return Array.from(new Set(list));
}

export async function headUrlOk(
  url: string,
  timeoutMs = 8000,
): Promise<{ ok: boolean; status: number | null; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "GrowthOS-LinkCheck/1.0" },
    });
    // Some hosts reject HEAD — fall back to GET range
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "GrowthOS-LinkCheck/1.0",
          Range: "bytes=0-0",
        },
      });
    }
    const status = res.status;
    const ok = status >= 200 && status < 400;
    return { ok, status };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : "fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function validateContentLinks(params: {
  organizationId: string;
  brandId: string;
  copy: string;
  title?: string | null;
}): Promise<{
  allowlist: string[];
  urls: string[];
  disallowed: string[];
  unreachable: Array<{ url: string; status: number | null; error?: string }>;
}> {
  const allowlist = await loadBrandLinkAllowlist(params);
  const text = `${params.title ?? ""}\n${params.copy}`;
  const urls = extractUrlsFromText(text);
  const disallowed = findDisallowedUrls(text, allowlist);
  const toProbe = urls.filter((u) => !disallowed.includes(u));
  const unreachable: Array<{
    url: string;
    status: number | null;
    error?: string;
  }> = [];
  for (const url of toProbe) {
    const result = await headUrlOk(url);
    if (!result.ok) {
      unreachable.push({
        url,
        status: result.status,
        error: result.error,
      });
    }
  }
  return { allowlist, urls, disallowed, unreachable };
}
