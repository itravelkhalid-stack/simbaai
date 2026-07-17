import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PlanningNav({ current }: { current: string }) {
  const links = [
    { href: "/planning", label: "Overview" },
    { href: "/planning/plans", label: "Plans" },
    { href: "/planning/campaigns", label: "Campaigns" },
    { href: "/planning/timeline", label: "Timeline" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
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
