import Link from "next/link";

import { stopImpersonation } from "@/lib/admin/actions";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { Button } from "@/components/ui/button";
import type { NotificationRow } from "@/components/dashboard/notification-bell";

export function DashboardHeader({
  userId,
  organizationId,
  orgName,
  notifications,
  impersonating,
  isPlatformAdmin,
}: {
  userId: string;
  organizationId: string;
  orgName: string;
  notifications: NotificationRow[];
  impersonating?: boolean;
  isPlatformAdmin?: boolean;
}) {
  return (
    <div className="mb-6 space-y-3">
      {impersonating ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>
            Support mode: viewing <strong>{orgName}</strong> as platform admin.
            Actions are audited.
          </p>
          <form action={stopImpersonation}>
            <Button type="submit" size="sm" variant="outline">
              Exit support mode
            </Button>
          </form>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{orgName}</p>
        <div className="flex items-center gap-2">
          {isPlatformAdmin ? (
            <Link
              href="/admin"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Platform admin
            </Link>
          ) : null}
          <NotificationBell
            userId={userId}
            organizationId={organizationId}
            initial={notifications}
          />
        </div>
      </div>
    </div>
  );
}
