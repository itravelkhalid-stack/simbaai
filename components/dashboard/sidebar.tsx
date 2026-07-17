"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOut } from "@/lib/auth/actions";
import { MODULE_NAV } from "@/lib/constants";
import type { OrgMembership } from "@/lib/org/session";
import type { Profile } from "@/lib/types/database";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { Button } from "@/components/ui/button";
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
    <aside className="flex h-full w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="space-y-4 border-b p-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            GrowthOS
          </p>
          <p className="mt-1 text-sm text-muted-foreground">AI Marketing Agency</p>
        </div>
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
                "block rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t p-4">
        <div>
          <p className="truncate text-sm font-medium">
            {profile?.full_name ?? "Account"}
          </p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
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
