"use client";

import Link from "next/link";

import {
  runAiTaskNow,
  updateTaskStatus,
} from "@/lib/planning/actions";
import type { CampaignTask, CampaignTaskStatus } from "@/lib/types/planning";
import { Button } from "@/components/ui/button";

const COLUMNS: Array<{ status: CampaignTaskStatus; label: string }> = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "in_review", label: "In review" },
  { status: "done", label: "Done" },
  { status: "blocked", label: "Blocked" },
];

export function TaskKanban({ tasks }: { tasks: CampaignTask[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      {COLUMNS.map((col) => {
        const items = tasks.filter((t) => t.status === col.status);
        return (
          <div key={col.status} className="rounded-xl border bg-muted/20 p-3">
            <p className="mb-3 text-sm font-medium">
              {col.label}{" "}
              <span className="text-muted-foreground">({items.length})</span>
            </p>
            <ul className="space-y-2">
              {items.map((task) => (
                <li key={task.id} className="space-y-2 rounded-lg border bg-background p-3 text-sm">
                  <p className="font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {task.module} · {task.assignee_type}
                    {task.due_date ? ` · due ${task.due_date}` : ""}
                  </p>
                  {task.linked_entity?.href ? (
                    <Link
                      href={String(task.linked_entity.href)}
                      className="text-xs underline"
                    >
                      Open linked work
                    </Link>
                  ) : null}
                  <div className="flex flex-wrap gap-1">
                    {col.status !== "done" ? (
                      <form action={updateTaskStatus}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="status" value="done" />
                        <Button type="submit" size="xs" variant="outline">
                          Done
                        </Button>
                      </form>
                    ) : null}
                    {task.assignee_type === "ai" && task.status === "todo" ? (
                      <form action={runAiTaskNow}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <Button type="submit" size="xs">
                          Run AI
                        </Button>
                      </form>
                    ) : null}
                    {col.status === "todo" ? (
                      <form action={updateTaskStatus}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <input type="hidden" name="status" value="in_progress" />
                        <Button type="submit" size="xs" variant="outline">
                          Start
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
