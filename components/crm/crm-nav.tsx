import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CrmNav({ current }: { current: string }) {
  const links = [
    { href: "/crm", label: "Dashboard" },
    { href: "/crm/contacts", label: "Contacts" },
    { href: "/crm/deals", label: "Deals" },
    { href: "/crm/webhooks", label: "Webhooks" },
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
