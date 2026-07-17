import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SeoNav({
  projectId,
  current,
}: {
  projectId?: string;
  current: string;
}) {
  const base = projectId ? `/seo/projects/${projectId}` : "/seo";
  const links = projectId
    ? [
        { href: base, label: "Overview" },
        { href: `${base}/keywords`, label: "Keywords" },
        { href: `${base}/audit`, label: "Technical audit" },
        { href: `${base}/ranks`, label: "Rank tracking" },
        { href: `${base}/briefs`, label: "Briefs" },
        { href: `${base}/articles`, label: "Articles" },
        { href: `${base}/summaries`, label: "Weekly summaries" },
      ]
    : [{ href: "/seo", label: "Projects" }];

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
