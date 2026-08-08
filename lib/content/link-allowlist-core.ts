/**
 * Pure link-allowlist helpers (safe for unit tests).
 * Async loaders / HEAD checks live in link-allowlist.ts.
 */

const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/gi;

export function extractUrlsFromText(text: string): string[] {
  const matches = text.match(URL_RE) ?? [];
  return Array.from(
    new Set(
      matches.map((u) => u.replace(/[.,;:!?)]+$/, "")).filter(Boolean),
    ),
  );
}

function normalizeOrigin(raw: string): URL | null {
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    if (!u.hostname) return null;
    u.hash = "";
    return u;
  } catch {
    return null;
  }
}

/** Allow if candidate shares host with allow entry and path starts with allow path (or allow is origin-only). */
export function urlAllowedByList(candidate: string, allowlist: string[]): boolean {
  const cand = normalizeOrigin(candidate);
  if (!cand) return false;
  const host = cand.hostname.replace(/^www\./i, "").toLowerCase();

  for (const entry of allowlist) {
    const a = normalizeOrigin(entry);
    if (!a) continue;
    const aHost = a.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== aHost && !host.endsWith(`.${aHost}`)) continue;
    const allowPath = a.pathname === "/" ? "/" : a.pathname.replace(/\/$/, "");
    if (allowPath === "/") return true;
    const candPath = cand.pathname.replace(/\/$/, "") || "/";
    if (candPath === allowPath || candPath.startsWith(`${allowPath}/`)) {
      return true;
    }
  }
  return false;
}

export function findDisallowedUrls(text: string, allowlist: string[]): string[] {
  if (!allowlist.length) {
    // No roots configured → any URL is disallowed (force website setup).
    return extractUrlsFromText(text);
  }
  return extractUrlsFromText(text).filter(
    (u) => !urlAllowedByList(u, allowlist),
  );
}
