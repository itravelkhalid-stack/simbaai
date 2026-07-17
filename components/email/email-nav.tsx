import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/email", label: "Overview" },
  { href: "/email/campaigns", label: "Campaigns" },
  { href: "/email/flows", label: "Flows" },
  { href: "/email/lists", label: "Lists" },
  { href: "/email/subscribers", label: "Subscribers" },
  { href: "/email/segments", label: "Segments" },
  { href: "/email/settings", label: "Sending domains" },
];

export function EmailNav({ current }: { current: string }) {
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
