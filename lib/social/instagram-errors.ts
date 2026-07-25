/**
 * Map Instagram Graph publish errors to human-readable messages.
 * Graph errors arrive as JSON strings like:
 * {"message":"...","type":"OAuthException","code":10,"error_subcode":2207009,"error_user_msg":"..."}
 */

export const IG_CAPTION_MAX_CHARS = 2200;
export const IG_CAROUSEL_MIN = 2;
export const IG_CAROUSEL_MAX = 10;

type ParsedGraphError = {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
};

function parseGraphError(raw: string): ParsedGraphError | null {
  try {
    const parsed = JSON.parse(raw) as ParsedGraphError | { error?: ParsedGraphError };
    if (parsed && typeof parsed === "object" && "error" in parsed && parsed.error) {
      return parsed.error as ParsedGraphError;
    }
    return parsed as ParsedGraphError;
  } catch {
    return null;
  }
}

export function humanizeInstagramGraphError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const parsed = parseGraphError(raw);
  const subcode = parsed?.error_subcode;
  const code = parsed?.code;
  const userMsg = parsed?.error_user_msg;
  const text = `${parsed?.message ?? ""} ${userMsg ?? ""} ${raw}`.toLowerCase();

  if (subcode === 2207009 || /aspect ratio/.test(text)) {
    return `Instagram rejected the image aspect ratio. Feed images must be between 4:5 and 1.91:1 — crop the image and try again. (${userMsg || raw})`;
  }
  if (
    subcode === 2207004 ||
    /image.*(too large|file size|8 ?mb)/.test(text)
  ) {
    return `Instagram rejected the image size. Use a JPEG under 8MB. (${userMsg || raw})`;
  }
  if (
    subcode === 2207028 ||
    /caption.*(too long|maximum)/.test(text)
  ) {
    return `Instagram caption is too long. Keep it under ${IG_CAPTION_MAX_CHARS} characters including hashtags. (${userMsg || raw})`;
  }
  if (
    subcode === 2207003 ||
    /media.*(download|fetch|url).*(fail|error)|could not fetch/.test(text)
  ) {
    return `Instagram could not download the image. The media URL must be public HTTPS and directly reachable. (${userMsg || raw})`;
  }
  if (
    code === 10 ||
    /not.*(business|creator)|professional account|instagram account.*not eligible|missing permissions?/.test(
      text,
    )
  ) {
    return `The Instagram account is not a Business/Creator account linked to the connected Facebook Page, or the app is missing Instagram permissions. Link the IG account to the Page in Meta Business settings and reconnect. (${userMsg || raw})`;
  }
  if (code === 190 || /access token|session has expired/.test(text)) {
    return `Meta access token expired or was revoked — reconnect Meta in Social. (${userMsg || raw})`;
  }
  if (code === 4 || code === 32 || code === 17 || /rate limit|too many/.test(text)) {
    return `Instagram rate limit reached — publishing will retry automatically. (${userMsg || raw})`;
  }
  if (userMsg) {
    return `Instagram: ${parsed?.error_user_title ? `${parsed.error_user_title} — ` : ""}${userMsg}`;
  }
  return raw;
}

/** Validate a media URL is publicly reachable over HTTPS and is an image. */
export async function assertPublicImageUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Instagram media URL is invalid: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(
      `Instagram requires public HTTPS image URLs — got ${parsed.protocol}//. Re-upload the media to the brand library.`,
    );
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
  } catch {
    throw new Error(
      `Instagram media URL is not reachable from the internet: ${url}. Ensure the file is in a public bucket.`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `Instagram media URL returned HTTP ${res.status} — it must be publicly readable without auth: ${url}`,
    );
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType && !contentType.startsWith("image/")) {
    throw new Error(
      `Instagram feed publishing currently supports images only — URL serves ${contentType}: ${url}`,
    );
  }
}

export function buildInstagramCaption(copy: string, hashtags: string[]): string {
  const caption = [copy, hashtags.map((h) => `#${h}`).join(" ")]
    .filter(Boolean)
    .join("\n\n");
  if (caption.length > IG_CAPTION_MAX_CHARS) {
    throw new Error(
      `Instagram caption is ${caption.length} characters — the limit is ${IG_CAPTION_MAX_CHARS} including hashtags. Shorten the copy or remove hashtags.`,
    );
  }
  return caption;
}
