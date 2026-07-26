"use client";

import { useEffect, useState, useTransition } from "react";

import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/actions";
import { createClient } from "@/lib/supabase/client";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
  category?: string;
  organization_id?: string;
};

export function NotificationBell({
  userId,
  organizationId,
  initial,
}: {
  userId: string;
  organizationId: string;
  initial: NotificationRow[];
}) {
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setItems(initial);
  }, [initial]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          if (row.organization_id && row.organization_id !== organizationId) {
            return;
          }
          setItems((prev) => [row, ...prev].slice(0, 20));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, organizationId]);

  const unread = items.filter((n) => !n.read_at).length;

  function markLocalRead(id: string) {
    setItems((prev) =>
      prev.map((x) =>
        x.id === id ? { ...x, read_at: x.read_at ?? new Date().toISOString() } : x,
      ),
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "relative")}
      >
        Notifications
        {unread > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Inbox</span>
          <button
            type="button"
            className="text-xs font-normal text-muted-foreground hover:underline disabled:opacity-50"
            disabled={pending || unread === 0}
            onClick={() => {
              startTransition(async () => {
                await markAllNotificationsRead();
                setItems((prev) =>
                  prev.map((n) => ({
                    ...n,
                    read_at: n.read_at ?? new Date().toISOString(),
                  })),
                );
              });
            }}
          >
            Mark all read
          </button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            No notifications yet.
          </div>
        ) : (
          items.slice(0, 12).map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="flex cursor-pointer flex-col items-start gap-1 py-2"
              onClick={() => {
                const fd = new FormData();
                fd.set("id", n.id);
                startTransition(async () => {
                  await markNotificationRead(fd);
                  markLocalRead(n.id);
                });
                if (n.link) {
                  window.location.href = n.link;
                }
              }}
            >
              <p className={n.read_at ? "text-sm" : "text-sm font-semibold"}>
                {n.title}
              </p>
              {n.body ? (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {n.body}
                </p>
              ) : null}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => {
            window.location.href = "/settings/notifications";
          }}
        >
          Notification settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
