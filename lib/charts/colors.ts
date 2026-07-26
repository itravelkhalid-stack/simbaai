/**
 * Recharts series colors — semantic order from Simba AI design system.
 * Prefer CSS variables so charts stay on the token layer.
 */
export const CHART_SERIES = [
  "var(--chart-1)", // teal
  "var(--chart-2)", // gold
  "var(--chart-3)", // crimson-pastel
  "var(--chart-4)", // green
  "var(--chart-5)", // teal-dark
] as const;

export const CHART_GRID = "var(--grid-line)";

/** Named aliases for common series roles */
export const CHART = {
  primary: CHART_SERIES[0],
  secondary: CHART_SERIES[1],
  tertiary: CHART_SERIES[2],
  success: CHART_SERIES[3],
  emphasis: CHART_SERIES[4],
  muted: "var(--ink-soft)",
  grid: CHART_GRID,
} as const;
