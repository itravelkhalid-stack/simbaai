"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { rescheduleContentItem } from "@/lib/content/actions";
import {
  PLATFORM_LABELS,
  STATUS_COLORS,
  type ContentItem,
  type ContentPlatform,
} from "@/lib/types/content";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLATFORM_BORDER: Record<ContentPlatform, string> = {
  instagram: "border-l-pink-500",
  facebook: "border-l-blue-600",
  tiktok: "border-l-zinc-900",
  x: "border-l-sky-500",
  linkedin: "border-l-sky-700",
  youtube: "border-l-red-600",
  pinterest: "border-l-rose-600",
};

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function ContentCalendar({
  items,
  canWrite,
}: {
  items: ContentItem[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));

  const days = useMemo(() => {
    if (mode === "week") {
      return Array.from({ length: 7 }, (_, i) => addDays(anchor, i));
    }
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeek(monthStart);
    return Array.from({ length: 35 }, (_, i) => addDays(gridStart, i));
  }, [anchor, mode]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    for (const item of items) {
      if (!item.scheduled_at) continue;
      const key = item.scheduled_at.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [items]);

  async function onDrop(day: Date, itemId: string) {
    if (!canWrite) return;
    const scheduledAt = new Date(day);
    scheduledAt.setHours(10, 0, 0, 0);
    const formData = new FormData();
    formData.set("itemId", itemId);
    formData.set("scheduledAt", scheduledAt.toISOString());
    await rescheduleContentItem(formData);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "week" ? "default" : "outline"}
            onClick={() => {
              setMode("week");
              setAnchor(startOfWeek(new Date()));
            }}
          >
            Week
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "month" ? "default" : "outline"}
            onClick={() => {
              setMode("month");
              setAnchor(new Date());
            }}
          >
            Month
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setAnchor(
                mode === "week"
                  ? addDays(anchor, -7)
                  : new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1),
              )
            }
          >
            Prev
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setAnchor(
                mode === "week"
                  ? addDays(anchor, 7)
                  : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1),
              )
            }
          >
            Next
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "grid gap-2",
          mode === "week" ? "md:grid-cols-7" : "md:grid-cols-7",
        )}
      >
        {days.map((day) => {
          const key = dayKey(day);
          const dayItems = itemsByDay.get(key) ?? [];
          return (
            <div
              key={key}
              className="min-h-36 rounded-xl border bg-card p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const itemId = e.dataTransfer.getData("text/content-item-id");
                if (itemId) onDrop(day, itemId);
              }}
            >
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {day.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </p>
              <div className="space-y-2">
                {dayItems.map((item) => (
                  <Link
                    key={item.id}
                    href={`/content/${item.id}`}
                    draggable={canWrite}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/content-item-id", item.id);
                    }}
                    className={cn(
                      "block rounded-lg border border-l-4 bg-background p-2 text-xs shadow-sm",
                      PLATFORM_BORDER[item.platform],
                      STATUS_COLORS[item.status],
                    )}
                  >
                    <p className="font-medium">
                      {PLATFORM_LABELS[item.platform]} · {item.status}
                    </p>
                    <p className="line-clamp-2">
                      {item.title || item.copy.slice(0, 60)}
                    </p>
                    {item.publish_error ? (
                      <p className="mt-1 line-clamp-2 text-[10px] text-red-600">
                        {item.publish_error}
                      </p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Drag items between days to reschedule. Colour bar = platform; border = status.
      </p>
    </div>
  );
}
