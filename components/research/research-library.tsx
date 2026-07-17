"use client";

import Link from "next/link";

import {
  RESEARCH_TYPE_LABELS,
  researchFreshness,
  type ResearchProject,
} from "@/lib/types/research";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function freshnessVariant(tone: ReturnType<typeof researchFreshness>["tone"]) {
  if (tone === "fresh") return "default" as const;
  if (tone === "aging") return "secondary" as const;
  if (tone === "stale") return "destructive" as const;
  return "outline" as const;
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
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
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
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
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

      <div className="rounded-xl border">
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
            {projects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No research projects yet. Start a brand audit or competitor scan.
                </TableCell>
              </TableRow>
            ) : (
              projects.map((project) => {
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
                      <Badge variant="outline">{project.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={freshnessVariant(freshness.tone)}>
                        {freshness.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(project.updated_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
