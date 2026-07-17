import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/content", label: "Overview" },
  { href: "/content/calendar", label: "Calendar" },
  { href: "/content/queue", label: "Review queue" },
  { href: "/content/generate", label: "Generate" },
  { href: "/content/pillars", label: "Pillars" },
];

export function ContentNav({ current }: { current: string }) {
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
