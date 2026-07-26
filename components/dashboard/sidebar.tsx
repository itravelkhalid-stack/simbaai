"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SimbaWordmark } from "@/components/brand/simba-wordmark";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { MODULE_NAV } from "@/lib/constants";
import type { OrgMembership } from "@/lib/org/session";
import type { Profile } from "@/lib/types/database";
import { cn } from "@/lib/utils";

export function Sidebar({
  memberships,
  activeOrganizationId,
  profile,
  email,
}: {
  memberships: OrgMembership[];
  activeOrganizationId: string;
  profile: Profile | null;
  email: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="space-y-4 border-b border-sidebar-border p-5">
        <SimbaWordmark showTagline size="md" />
        <OrgSwitcher
          memberships={memberships}
          activeOrganizationId={activeOrganizationId}
        />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {MODULE_NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative block rounded-full px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-brand-soft font-medium text-primary"
                  : "text-ink-soft hover:bg-surface-soft hover:text-ink",
                active &&
                  "before:absolute before:top-1/2 before:left-0 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-brand",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-sidebar-border p-4">
        <div>
          <p className="truncate text-sm font-medium text-ink">
            {profile?.full_name ?? "Account"}
          </p>
          <p className="truncate text-xs text-ink-soft">{email}</p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  );
}
