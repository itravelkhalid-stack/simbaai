/**
 * Workspace client theming — brand colors/logo for data surfaces & exports.
 * Simba chrome (buttons, nav) stays on semantic primary tokens.
 * Client-safe: no next/headers imports.
 */

export type WorkspaceTheme = {
  brandId: string | null;
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  accentColor: string | null;
};

const HEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

/** Simba defaults when a brand has no colours yet. */
export const SIMBA_THEME_FALLBACK = {
  primaryColor: "#0F6F68",
  secondaryColor: "#E3B341",
  accentColor: "#00A99D",
} as const;

export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!HEX.test(v)) return null;
  if (v.length === 4) {
    const r = v[1];
    const g = v[2];
    const b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return v.toUpperCase();
}

export function resolveWorkspaceTheme(input: {
  brandId?: string | null;
  brandName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  organizationName: string;
}): WorkspaceTheme {
  const primary =
    normalizeHex(input.primaryColor) ?? SIMBA_THEME_FALLBACK.primaryColor;
  const secondary =
    normalizeHex(input.secondaryColor) ?? SIMBA_THEME_FALLBACK.secondaryColor;
  const accent =
    normalizeHex(input.accentColor) ??
    normalizeHex(input.primaryColor) ??
    SIMBA_THEME_FALLBACK.accentColor;

  return {
    brandId: input.brandId ?? null,
    brandName: input.brandName?.trim() || input.organizationName,
    logoUrl: input.logoUrl?.trim() || null,
    primaryColor: primary,
    secondaryColor: secondary,
    accentColor: accent,
  };
}

/** CSS custom properties for client data surfaces (charts, report accents). */
export function workspaceThemeStyle(
  theme: WorkspaceTheme,
): Record<string, string> {
  return {
    "--client-primary": theme.primaryColor,
    "--client-secondary":
      theme.secondaryColor ?? SIMBA_THEME_FALLBACK.secondaryColor,
    "--client-accent": theme.accentColor ?? SIMBA_THEME_FALLBACK.accentColor,
    "--chart-1": theme.accentColor ?? theme.primaryColor,
    "--chart-5": theme.primaryColor,
  };
}
