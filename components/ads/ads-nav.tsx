import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/ads", label: "Dashboard" },
  { href: "/ads/budgets", label: "Budgets" },
  { href: "/ads/directives", label: "Directives" },
  { href: "/ads/seasonality", label: "Seasonality" },
  { href: "/ads/plans", label: "Media plans" },
  { href: "/ads/campaigns", label: "Campaigns" },
  { href: "/ads/approvals", label: "Creative approvals" },
  { href: "/ads/recommendations", label: "Recommendations" },
  { href: "/ads/connections", label: "Connections" },
  { href: "/ads/settings", label: "Settings" },
];

export function AdsNav({ current }: { current: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            buttonVariants({
              variant: current === link.href ? "default" : "outline",
              size: "sm",
            }),
          )}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
