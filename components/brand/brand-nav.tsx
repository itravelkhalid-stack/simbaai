import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/brand", label: "Brands" },
  { href: "/brand/setup", label: "Setup" },
  { href: "/brand/guidelines", label: "Guidelines" },
  { href: "/brand/media", label: "Media" },
];

export function BrandNav({ current }: { current: string }) {
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
