"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ClientBrandMark } from "@/components/brand/client-brand-mark";
import { SimbaWordmark } from "@/components/brand/simba-wordmark";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import type { WorkspaceTheme } from "@/lib/brand/theme";
import { MODULE_NAV } from "@/lib/constants";
import type { OrgMembership } from "@/lib/org/session";
import type { Profile } from "@/lib/types/database";
import { cn } from "@/lib/utils";

export function SidebarNav({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex-1 space-y-1 overflow-y-auto p-3", className)}>
      {MODULE_NAV.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "relative block rounded-full px-3 py-2 text-sm transition-colors duration-150",
              active
                ? "bg-brand-soft font-medium text-primary"
                : "text-ink-soft hover:bg-surface hover:text-ink",
              active &&
                "before:absolute before:top-1/2 before:left-0 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-brand",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarChrome({
  memberships,
  activeOrganizationId,
  profile,
  email,
  workspaceTheme,
  onNavigate,
  className,
}: {
  memberships: OrgMembership[];
  activeOrganizationId: string;
  profile: Profile | null;
  email: string;
  workspaceTheme: WorkspaceTheme;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col bg-surface-soft text-ink",
        className,
      )}
    >
      <div className="space-y-4 border-b border-border p-5">
        <SimbaWordmark size="sm" />
        <ClientBrandMark theme={workspaceTheme} />
        <OrgSwitcher
          memberships={memberships}
          activeOrganizationId={activeOrganizationId}
        />
      </div>

      <SidebarNav onNavigate={onNavigate} />

      <div className="space-y-3 border-t border-border p-4">
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
    </div>
  );
}

export function Sidebar({
  memberships,
  activeOrganizationId,
  profile,
  email,
  workspaceTheme,
}: {
  memberships: OrgMembership[];
  activeOrganizationId: string;
  profile: Profile | null;
  email: string;
  workspaceTheme: WorkspaceTheme;
}) {
  return (
    <aside className="hidden h-full w-64 shrink-0 border-r border-border lg:flex">
      <SidebarChrome
        memberships={memberships}
        activeOrganizationId={activeOrganizationId}
        profile={profile}
        email={email}
        workspaceTheme={workspaceTheme}
      />
    </aside>
  );
}
