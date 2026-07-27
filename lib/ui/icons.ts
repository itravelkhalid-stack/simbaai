/** Lucide icon defaults for Simba AI UI. */
export const ICON = {
  size: 20,
  className: "size-5 shrink-0",
  strokeWidth: 1.5,
} as const;

export function iconProps(extraClassName?: string) {
  return {
    size: ICON.size,
    strokeWidth: ICON.strokeWidth,
    className: extraClassName
      ? `${ICON.className} ${extraClassName}`
      : ICON.className,
  };
}
