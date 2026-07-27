"use client";

import { useState } from "react";

import { stopImpersonation } from "@/lib/admin/actions";
import { Sidebar, SidebarChrome } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/top-bar";
import type { NotificationRow } from "@/components/dashboard/notification-bell";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { OrgMembership } from "@/lib/org/session";
import type { Profile } from "@/lib/types/database";
import {
  workspaceThemeStyle,
  type WorkspaceTheme,
} from "@/lib/brand/theme";

export function DashboardShell({
  memberships,
  activeOrganizationId,
  profile,
  email,
  userId,
  organizationId,
  orgName,
  notifications,
  impersonating,
  isPlatformAdmin,
  workspaceTheme,
  banners,
  children,
}: {
  memberships: OrgMembership[];
  activeOrganizationId: string;
  profile: Profile | null;
  email: string;
  userId: string;
  organizationId: string;
  orgName: string;
  notifications: NotificationRow[];
  impersonating?: boolean;
  isPlatformAdmin?: boolean;
  workspaceTheme: WorkspaceTheme;
  banners?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const themeStyle = workspaceThemeStyle(workspaceTheme);

  return (
    <div className="flex min-h-screen bg-background" style={themeStyle}>
      <Sidebar
        memberships={memberships}
        activeOrganizationId={activeOrganizationId}
        profile={profile}
        email={email}
        workspaceTheme={workspaceTheme}
      />

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent
          side="left"
          showCloseButton
          className="w-[min(100%,20rem)] max-w-none gap-0 bg-surface-soft p-0 sm:max-w-none"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarChrome
            memberships={memberships}
            activeOrganizationId={activeOrganizationId}
            profile={profile}
            email={email}
            workspaceTheme={workspaceTheme}
            onNavigate={() => setNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onOpenNav={() => setNavOpen(true)}
          userId={userId}
          organizationId={organizationId}
          orgName={orgName}
          notifications={notifications}
          isPlatformAdmin={isPlatformAdmin}
        />

        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-8">
            {impersonating ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-ink">
                <p>
                  Support mode: viewing <strong>{orgName}</strong> as platform
                  admin. Actions are audited.
                </p>
                <form action={stopImpersonation}>
                  <Button type="submit" size="sm" variant="outline">
                    Exit support mode
                  </Button>
                </form>
              </div>
            ) : null}
            {banners}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
