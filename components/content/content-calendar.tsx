"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { rescheduleContentItem } from "@/lib/content/actions";
import {
  FORMAT_LABELS,
  PLATFORM_LABELS,
  STATUS_LABELS,
  type ContentItem,
  type ContentPlatform,
} from "@/lib/types/content";
import { localDayKey, localDayKeyFromIso } from "@/lib/datetime/local";
import { statusTone } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

const PLATFORM_DOT: Record<ContentPlatform, string> = {
  instagram: "bg-danger",
  facebook: "bg-brand",
  tiktok: "bg-ink",
  x: "bg-ink-soft",
  linkedin: "bg-primary",
  youtube: "bg-danger",
  pinterest: "bg-warning",
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

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);

  const monthCursor = useMemo(
    () =>
      mode === "month"
        ? new Date(anchor.getFullYear(), anchor.getMonth(), 1)
        : anchor,
    [anchor, mode],
  );

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
      const key = localDayKeyFromIso(item.scheduled_at);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    for (const [key, list] of map) {
      list.sort((a, b) => {
        const aStory = a.format === "story" ? 1 : 0;
        const bStory = b.format === "story" ? 1 : 0;
        if (aStory !== bStory) return aStory - bStory;
        if (a.platform !== b.platform) {
          return a.platform.localeCompare(b.platform);
        }
        return (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "");
      });
      map.set(key, list);
    }
    return map;
  }, [items]);

  const rangeLabel =
    mode === "week"
      ? `${days[0]?.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6]?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
      : monthCursor.toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        });

  async function onDrop(day: Date, itemId: string) {
    if (!canWrite) return;
    const scheduledAt = new Date(day);
    scheduledAt.setHours(10, 0, 0, 0);
    const formData = new FormData();
    formData.set("itemId", itemId);
    formData.set("scheduledAt", scheduledAt.toISOString());
    await rescheduleContentItem(formData);
    setDraggingId(null);
    setOverDay(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
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
          <p className="ml-2 font-heading text-sm font-semibold text-ink">
            {rangeLabel}
          </p>
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
            onClick={() => {
              setMode(mode);
              setAnchor(
                mode === "week" ? startOfWeek(new Date()) : new Date(),
              );
            }}
          >
            Today
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

      <div className="overflow-hidden rounded-lg bg-card shadow-elevated ring-1 ring-border">
        <div className="grid grid-cols-7 border-b border-border bg-surface-soft">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-ink-soft"
            >
              {d}
            </div>
          ))}
        </div>
        <div
          className={cn(
            "grid grid-cols-1 md:grid-cols-7",
            mode === "month" ? "auto-rows-fr" : "",
          )}
        >
          {days.map((day) => {
            const key = localDayKey(day);
            const dayItems = itemsByDay.get(key) ?? [];
            const outside =
              mode === "month" && !isSameMonth(day, monthCursor);
            const isToday = localDayKey(new Date()) === key;
            const isOver = overDay === key && draggingId;

            return (
              <div
                key={key}
                className={cn(
                  "min-h-36 border-b border-r border-border p-2 transition-colors last:border-r-0 md:[&:nth-child(7n)]:border-r-0",
                  outside ? "bg-muted/40" : "bg-card",
                  isOver && "bg-brand-soft ring-2 ring-inset ring-brand",
                )}
                onDragOver={(e) => {
                  if (!canWrite) return;
                  e.preventDefault();
                  setOverDay(key);
                }}
                onDragLeave={() => {
                  setOverDay((cur) => (cur === key ? null : cur));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const itemId = e.dataTransfer.getData("text/content-item-id");
                  if (itemId) onDrop(day, itemId);
                }}
              >
                <div className="mb-2">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      outside ? "text-ink-soft/60" : "text-ink-soft",
                      isToday &&
                        "inline-flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground",
                    )}
                  >
                    {day.getDate()}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {dayItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`/content/${item.id}`}
                      draggable={canWrite}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "text/content-item-id",
                          item.id,
                        );
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(item.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverDay(null);
                      }}
                      className={cn(
                        "block rounded-md bg-surface p-2 text-xs ring-1 ring-border transition-all hover:ring-brand/40",
                        draggingId === item.id &&
                          "scale-[0.98] opacity-40 ring-brand",
                      )}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span
                          aria-hidden
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            PLATFORM_DOT[item.platform],
                          )}
                          title={PLATFORM_LABELS[item.platform]}
                        />
                        <span className="truncate font-medium text-ink">
                          {PLATFORM_LABELS[item.platform]}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-4 px-1.5 text-[10px]",
                            item.format === "story" &&
                              "border-warning/50 text-warning",
                          )}
                        >
                          {FORMAT_LABELS[item.format]}
                        </Badge>
                        <Badge
                          variant={statusTone(item.status)}
                          className="h-4 px-1.5 text-[10px]"
                        >
                          {STATUS_LABELS[item.status]}
                        </Badge>
                      </div>
                      {item.media_urls?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.media_urls[0]}
                          alt=""
                          className={cn(
                            "mb-1 w-full rounded object-cover",
                            item.format === "story"
                              ? "aspect-[9/16] max-h-28"
                              : "aspect-video",
                          )}
                        />
                      ) : null}
                      <p className="line-clamp-2 text-ink-soft">
                        {item.title || item.copy.slice(0, 60)}
                      </p>
                      {(item.platform === "instagram" ||
                        item.format === "story") &&
                      !item.media_urls?.[0] ? (
                        <p className="mt-1 text-[10px] text-danger">
                          Needs image
                        </p>
                      ) : null}
                      {item.publish_error ? (
                        <p className="mt-1 line-clamp-2 text-[10px] text-danger">
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
      </div>

      <p className="text-xs text-ink-soft">
        Drag items between days to reschedule. Dot = platform · format badge
        (Post/Story) · status.
      </p>
    </div>
  );
}
