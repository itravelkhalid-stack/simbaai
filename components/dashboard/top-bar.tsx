"use client";

import Link from "next/link";
import { Menu } from "lucide-react";

import {
  Breadcrumbs,
  useDashboardCrumbs,
} from "@/components/dashboard/breadcrumbs";
import {
  NotificationBell,
  type NotificationRow,
} from "@/components/dashboard/notification-bell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TopBar({
  onOpenNav,
  userId,
  organizationId,
  orgName,
  notifications,
  isPlatformAdmin,
  className,
}: {
  onOpenNav?: () => void;
  userId: string;
  organizationId: string;
  orgName: string;
  notifications: NotificationRow[];
  isPlatformAdmin?: boolean;
  className?: string;
}) {
  const { pageTitle } = useDashboardCrumbs();

  return (
    <div
      className={cn(
        "sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 md:px-8">
        {onOpenNav ? (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="shrink-0 lg:hidden"
            onClick={onOpenNav}
            aria-label="Open navigation"
          >
            <Menu size={20} strokeWidth={1.5} className="size-5" />
          </Button>
        ) : null}

        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-heading text-lg font-bold tracking-tight text-ink md:text-xl">
            {pageTitle}
          </p>
          <Breadcrumbs className="hidden sm:block" />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <p className="hidden text-sm text-ink-soft sm:block">{orgName}</p>
          {isPlatformAdmin ? (
            <Link
              href="/admin"
              className="hidden text-sm text-ink-soft underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline md:inline"
            >
              Admin
            </Link>
          ) : null}
          <NotificationBell
            userId={userId}
            organizationId={organizationId}
            initial={notifications}
            iconOnly
          />
        </div>
      </div>
    </div>
  );
}
