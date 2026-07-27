"use client";

import Link from "next/link";

import {
  RESEARCH_TYPE_LABELS,
  researchFreshness,
  type ResearchProject,
} from "@/lib/types/research";
import { EmptyState } from "@/components/brand/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fieldSelectClass } from "@/lib/ui/field";
import { statusTone } from "@/lib/ui/status";

function freshnessTone(tone: ReturnType<typeof researchFreshness>["tone"]) {
  if (tone === "fresh") return "success" as const;
  if (tone === "aging") return "warning" as const;
  if (tone === "stale") return "danger" as const;
  return "neutral" as const;
}

export function ResearchLibrary({
  projects,
  typeFilter,
  statusFilter,
}: {
  projects: ResearchProject[];
  typeFilter?: string;
  statusFilter?: string;
}) {
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-3">
        <select
          name="type"
          defaultValue={typeFilter ?? ""}
          className={fieldSelectClass}
          onChange={(e) => {
            const params = new URLSearchParams(window.location.search);
            if (e.target.value) params.set("type", e.target.value);
            else params.delete("type");
            window.location.search = params.toString();
          }}
        >
          <option value="">All types</option>
          {Object.entries(RESEARCH_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={statusFilter ?? ""}
          className={fieldSelectClass}
          onChange={(e) => {
            const params = new URLSearchParams(window.location.search);
            if (e.target.value) params.set("status", e.target.value);
            else params.delete("status");
            window.location.search = params.toString();
          }}
        >
          <option value="">All statuses</option>
          <option value="queued">queued</option>
          <option value="running">running</option>
          <option value="complete">complete</option>
          <option value="failed">failed</option>
        </select>
      </form>

      {projects.length === 0 ? (
        <EmptyState
          title="Research that moves your marketing forward"
          description="Run a brand audit or competitor scan to give Simba AI the context it needs to make sharper recommendations."
          actionLabel="Start research"
          actionHref="/research/new"
        />
      ) : (
      <div className="rounded-lg bg-card shadow-elevated ring-1 ring-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Freshness</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => {
                const freshness = researchFreshness(project.completed_at);
                return (
                  <TableRow key={project.id}>
                    <TableCell>
                      <Link
                        href={`/research/${project.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {project.title}
                      </Link>
                    </TableCell>
                    <TableCell>{RESEARCH_TYPE_LABELS[project.type]}</TableCell>
                    <TableCell>
                      <Badge variant={statusTone(project.status)}>{project.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={freshnessTone(freshness.tone)}>
                        {freshness.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(project.updated_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
      )}
    </div>
  );
}
