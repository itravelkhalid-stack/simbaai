import type { SeoPageIssue } from "@/lib/types/seo";

const DEFAULT_CAP = 40;
const USER_AGENT = "GrowthOS-SEO-Audit/1.0 (+https://growthos.app)";

type RobotsRules = {
  disallow: string[];
  allow: string[];
};

async function fetchText(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      ...(init?.headers ?? {}),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  return res;
}

function normalizeDomain(domain: string) {
  const withProto = domain.startsWith("http") ? domain : `https://${domain}`;
  return new URL(withProto);
}

export async function loadRobotsTxt(origin: string): Promise<RobotsRules> {
  try {
    const res = await fetchText(new URL("/robots.txt", origin).toString());
    if (!res.ok) return { disallow: [], allow: [] };
    const text = await res.text();
    const disallow: string[] = [];
    const allow: string[] = [];
    let applies = false;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [rawKey, ...rest] = trimmed.split(":");
      const key = rawKey.toLowerCase();
      const value = rest.join(":").trim();
      if (key === "user-agent") {
        applies = value === "*" || value.toLowerCase().includes("growthos");
      } else if (applies && key === "disallow" && value) {
        disallow.push(value);
      } else if (applies && key === "allow" && value) {
        allow.push(value);
      }
    }
    return { disallow, allow };
  } catch {
    return { disallow: [], allow: [] };
  }
}

function isAllowed(pathname: string, rules: RobotsRules) {
  const blocked = rules.disallow.some(
    (d) => d !== "" && pathname.startsWith(d),
  );
  if (!blocked) return true;
  return rules.allow.some((a) => pathname.startsWith(a));
}

function extractTag(html: string, tag: string) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  return m?.[1]?.replace(/<[^>]+>/g, "").trim() ?? null;
}

function extractMeta(html: string, name: string) {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["'][^>]*>`,
    "i",
  );
  return html.match(re)?.[1] ?? html.match(re2)?.[1] ?? null;
}

function extractLinks(html: string, base: URL) {
  const hrefs: string[] = [];
  const re = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const url = new URL(m[1], base);
      if (url.protocol === "http:" || url.protocol === "https:") {
        hrefs.push(url.toString());
      }
    } catch {
      // ignore
    }
  }
  return [...new Set(hrefs)];
}

function countMissingAlt(html: string) {
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  let missing = 0;
  for (const img of imgs) {
    if (!/\balt=["'][^"']+["']/i.test(img) && !/\balt=["']["']/i.test(img)) {
      // missing or empty alt both count as issues for meaningful images
      if (!/\balt=/i.test(img) || /\balt=["']\s*["']/i.test(img)) missing += 1;
    }
  }
  return missing;
}

function hasSchema(html: string) {
  return (
    /application\/ld\+json/i.test(html) ||
    /itemtype=["']https?:\/\/schema\.org/i.test(html)
  );
}

function visibleWordCount(html: string) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").length : 0;
}

export type AuditedPage = {
  url: string;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  word_count: number;
  has_schema: boolean;
  missing_alt_count: number;
  broken_link_count: number;
  pagespeed_score: number | null;
  pagespeed_raw: Record<string, unknown>;
  issues: SeoPageIssue[];
  status: "ok" | "needs_work" | "critical";
};

async function checkBrokenLinks(links: string[], originHost: string, limit = 15) {
  let broken = 0;
  const sample = links
    .filter((l) => {
      try {
        return new URL(l).host === originHost;
      } catch {
        return false;
      }
    })
    .slice(0, limit);
  for (const link of sample) {
    try {
      const res = await fetchText(link, { method: "HEAD" });
      if (res.status >= 400) broken += 1;
    } catch {
      broken += 1;
    }
  }
  return broken;
}

export async function fetchPageSpeed(url: string) {
  const key = process.env.PAGESPEED_API_KEY || process.env.GOOGLE_PAGESPEED_API_KEY;
  if (!key) return { score: null as number | null, raw: {} as Record<string, unknown> };
  try {
    const endpoint = new URL(
      "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
    );
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("strategy", "mobile");
    endpoint.searchParams.set("key", key);
    endpoint.searchParams.set("category", "performance");
    const res = await fetch(endpoint.toString(), {
      signal: AbortSignal.timeout(60000),
    });
    const json = (await res.json()) as {
      lighthouseResult?: {
        categories?: { performance?: { score?: number } };
      };
    };
    const score = json.lighthouseResult?.categories?.performance?.score;
    return {
      score: score != null ? Math.round(score * 100) : null,
      raw: json as unknown as Record<string, unknown>,
    };
  } catch {
    return { score: null, raw: {} };
  }
}

function prioritizeIssues(issues: SeoPageIssue[]) {
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...issues].sort((a, b) => order[a.severity] - order[b.severity]);
}

export async function auditPage(url: string, options?: { checkSpeed?: boolean }) {
  const issues: SeoPageIssue[] = [];
  const res = await fetchText(url);
  if (!res.ok) {
    issues.push({
      code: "http_error",
      severity: "critical",
      message: `HTTP ${res.status}`,
    });
    return {
      url,
      title: null,
      meta_description: null,
      h1: null,
      word_count: 0,
      has_schema: false,
      missing_alt_count: 0,
      broken_link_count: 0,
      pagespeed_score: null,
      pagespeed_raw: {},
      issues: prioritizeIssues(issues),
      status: "critical" as const,
    };
  }

  const html = await res.text();
  const base = new URL(url);
  const title = extractTag(html, "title");
  const meta = extractMeta(html, "description");
  const h1 = extractTag(html, "h1");
  const words = visibleWordCount(html);
  const schema = hasSchema(html);
  const missingAlt = countMissingAlt(html);
  const links = extractLinks(html, base);
  const broken = await checkBrokenLinks(links, base.host);

  if (!title) {
    issues.push({ code: "missing_title", severity: "high", message: "Missing <title>" });
  } else if (title.length < 15 || title.length > 65) {
    issues.push({
      code: "title_length",
      severity: "medium",
      message: `Title length ${title.length} (aim 15–65)`,
      evidence: title,
    });
  }

  if (!meta) {
    issues.push({
      code: "missing_meta",
      severity: "high",
      message: "Missing meta description",
    });
  } else if (meta.length < 50 || meta.length > 160) {
    issues.push({
      code: "meta_length",
      severity: "medium",
      message: `Meta description length ${meta.length} (aim 50–160)`,
    });
  }

  if (!h1) {
    issues.push({ code: "missing_h1", severity: "high", message: "Missing H1" });
  }

  if (words < 200) {
    issues.push({
      code: "thin_content",
      severity: "high",
      message: `Thin content (${words} words)`,
    });
  }

  if (missingAlt > 0) {
    issues.push({
      code: "missing_alt",
      severity: "medium",
      message: `${missingAlt} image(s) missing alt text`,
    });
  }

  if (!schema) {
    issues.push({
      code: "missing_schema",
      severity: "low",
      message: "No JSON-LD / schema.org markup detected",
    });
  }

  if (broken > 0) {
    issues.push({
      code: "broken_links",
      severity: "high",
      message: `${broken} broken internal link(s) in sample`,
    });
  }

  let pagespeed_score: number | null = null;
  let pagespeed_raw: Record<string, unknown> = {};
  if (options?.checkSpeed !== false) {
    const speed = await fetchPageSpeed(url);
    pagespeed_score = speed.score;
    pagespeed_raw = speed.raw;
    if (speed.score != null && speed.score < 50) {
      issues.push({
        code: "pagespeed",
        severity: "high",
        message: `PageSpeed mobile score ${speed.score}`,
      });
    } else if (speed.score != null && speed.score < 80) {
      issues.push({
        code: "pagespeed",
        severity: "medium",
        message: `PageSpeed mobile score ${speed.score}`,
      });
    }
  }

  const ranked = prioritizeIssues(issues);
  const status = ranked.some((i) => i.severity === "critical")
    ? ("critical" as const)
    : ranked.some((i) => i.severity === "high")
      ? ("needs_work" as const)
      : ranked.length
        ? ("needs_work" as const)
        : ("ok" as const);

  return {
    url,
    title,
    meta_description: meta,
    h1,
    word_count: words,
    has_schema: schema,
    missing_alt_count: missingAlt,
    broken_link_count: broken,
    pagespeed_score,
    pagespeed_raw,
    issues: ranked,
    status,
  };
}

export async function crawlAndAuditSite(params: {
  domain: string;
  pageCap?: number;
  checkSpeedOnFirstN?: number;
}) {
  const root = normalizeDomain(params.domain);
  const origin = root.origin;
  const cap = params.pageCap ?? DEFAULT_CAP;
  const speedN = params.checkSpeedOnFirstN ?? 3;
  const robots = await loadRobotsTxt(origin);

  const queue = [root.toString().replace(/\/$/, "") + "/"];
  const seen = new Set<string>();
  const results: AuditedPage[] = [];

  while (queue.length && results.length < cap) {
    const next = queue.shift()!;
    const normalized = next.split("#")[0].replace(/\/$/, "") || next;
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    let pathname = "/";
    try {
      pathname = new URL(normalized).pathname;
    } catch {
      continue;
    }
    if (!isAllowed(pathname, robots)) continue;

    try {
      const audited = await auditPage(normalized, {
        checkSpeed: results.length < speedN,
      });
      results.push(audited);

      if (audited.status !== "critical") {
        const res = await fetchText(normalized);
        if (res.ok) {
          const html = await res.text();
          const links = extractLinks(html, root).filter((l) => {
            try {
              return new URL(l).origin === origin;
            } catch {
              return false;
            }
          });
          for (const link of links) {
            const clean = link.split("#")[0].replace(/\/$/, "");
            if (!seen.has(clean) && !queue.includes(clean)) queue.push(clean);
          }
        }
      }
    } catch (error) {
      results.push({
        url: normalized,
        title: null,
        meta_description: null,
        h1: null,
        word_count: 0,
        has_schema: false,
        missing_alt_count: 0,
        broken_link_count: 0,
        pagespeed_score: null,
        pagespeed_raw: {},
        issues: [
          {
            code: "crawl_error",
            severity: "critical",
            message: error instanceof Error ? error.message : "Crawl failed",
          },
        ],
        status: "critical",
      });
    }
  }

  return results;
}
