"use client";

import {
  Component,
  useCallback,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Bell } from "lucide-react";

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

class BellErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[notification-bell]", error);
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

function NotificationBellInner({
  userId,
  organizationId,
  initial,
  iconOnly = false,
  disableRealtime = false,
}: {
  userId: string;
  organizationId: string;
  initial: NotificationRow[];
  iconOnly?: boolean;
  disableRealtime?: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [realtimeOk, setRealtimeOk] = useState(!disableRealtime);

  useEffect(() => {
    setItems(initial);
  }, [initial]);

  const refreshFromServer = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id, title, body, link, read_at, created_at, category, organization_id",
        )
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      setItems((data as NotificationRow[]) ?? []);
    } catch (error) {
      console.error("[notification-bell] poll failed", error);
    }
  }, [organizationId, userId]);

  // Polling fallback (also primary when realtime is disabled)
  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshFromServer();
    }, realtimeOk ? 90_000 : 30_000);
    return () => window.clearInterval(id);
  }, [realtimeOk, refreshFromServer]);

  useEffect(() => {
    if (disableRealtime) return;

    let cancelled = false;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as NotificationRow;
            if (row.organization_id && row.organization_id !== organizationId) {
              return;
            }
            setItems((prev) => {
              if (prev.some((p) => p.id === row.id)) return prev;
              return [row, ...prev].slice(0, 20);
            });
            return;
          }
          if (payload.eventType === "UPDATE") {
            const row = payload.new as NotificationRow;
            setItems((prev) =>
              prev.map((p) => (p.id === row.id ? { ...p, ...row } : p)),
            );
          }
        },
      )
      .subscribe((status, err) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          setRealtimeOk(true);
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || err) {
          console.error("[notification-bell] realtime unavailable", status, err);
          setRealtimeOk(false);
          void refreshFromServer();
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [disableRealtime, organizationId, refreshFromServer, userId]);

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
        className={cn(
          buttonVariants({
            variant: "outline",
            size: iconOnly ? "icon-sm" : "sm",
          }),
          "relative",
        )}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
      >
        {iconOnly ? (
          <Bell size={20} strokeWidth={1.5} className="size-5" />
        ) : (
          "Notifications"
        )}
        {unread > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-ink">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Inbox</span>
          <button
            type="button"
            className="text-xs font-normal text-ink-soft hover:underline disabled:opacity-50"
            disabled={pending || unread === 0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
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
          <div className="px-2 py-6 text-center text-sm text-ink-soft">
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
                <p className="line-clamp-2 text-xs text-ink-soft">{n.body}</p>
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

/** Static fallback when the interactive bell throws (e.g. menu/realtime bugs). */
function NotificationBellFallback({
  initial,
  iconOnly,
}: {
  initial: NotificationRow[];
  iconOnly?: boolean;
}) {
  const unread = initial.filter((n) => !n.read_at).length;
  return (
    <a
      href="/settings/notifications"
      className={cn(
        buttonVariants({
          variant: "outline",
          size: iconOnly ? "icon-sm" : "sm",
        }),
        "relative",
      )}
      aria-label={
        unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
      }
      title="Open notification settings"
    >
      {iconOnly ? (
        <Bell size={20} strokeWidth={1.5} className="size-5" />
      ) : (
        "Notifications"
      )}
      {unread > 0 ? (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-ink">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </a>
  );
}

export function NotificationBell(props: {
  userId: string;
  organizationId: string;
  initial: NotificationRow[];
  iconOnly?: boolean;
}) {
  return (
    <BellErrorBoundary
      fallback={
        <NotificationBellFallback
          initial={props.initial}
          iconOnly={props.iconOnly}
        />
      }
    >
      <NotificationBellInner {...props} />
    </BellErrorBoundary>
  );
}
