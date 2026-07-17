import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ReviewsNav({ current }: { current: string }) {
  const links = [
    { href: "/reviews", label: "Reports" },
    { href: "/reviews/kpis", label: "KPIs" },
    { href: "/reviews/settings", label: "Schedule" },
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
