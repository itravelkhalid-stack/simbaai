"use client";

import { useActionState } from "react";
import { jsPDF } from "jspdf";

import {
  pushInsightsToBrand,
  refreshResearch,
  type ResearchActionResult,
} from "@/lib/research/actions";
import type { ResearchDocument, ResearchProject } from "@/lib/types/research";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initial: ResearchActionResult = {};

function buildReportText(project: ResearchProject, documents: ResearchDocument[]) {
  return [
    `# ${project.title}`,
    "",
    ...documents.flatMap((doc) => [
      `## ${doc.section.replaceAll("_", " ")}`,
      "",
      doc.content,
      "",
    ]),
  ].join("\n");
}

export function ResearchActions({
  project,
  documents,
  canWrite,
}: {
  project: ResearchProject;
  documents: ResearchDocument[];
  canWrite: boolean;
}) {
  const [pushState, pushAction, pushPending] = useActionState(
    pushInsightsToBrand,
    initial,
  );
  const [refreshState, refreshAction, refreshPending] = useActionState(
    refreshResearch,
    initial,
  );

  function exportPdf() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const text = buildReportText(project, documents);
    const lines = doc.splitTextToSize(text, 500);
    let y = 48;
    doc.setFontSize(11);
    for (const line of lines) {
      if (y > 780) {
        doc.addPage();
        y = 48;
      }
      doc.text(line, 48, y);
      y += 14;
    }
    doc.save(`${project.title.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  }

  const feedback = pushState.error || pushState.success || refreshState.error;

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={exportPdf}>
          Export PDF
        </Button>
        {canWrite && project.status === "complete" ? (
          <form action={pushAction}>
            <input type="hidden" name="projectId" value={project.id} />
            <Button type="submit" disabled={pushPending}>
              {pushPending ? "Pushing…" : "Push insights to Brand profile"}
            </Button>
          </form>
        ) : null}
      </div>

      {canWrite ? (
        <form action={refreshAction} className="space-y-3 border-t pt-4">
          <input type="hidden" name="projectId" value={project.id} />
          <p className="text-sm font-medium">Refresh research</p>
          <p className="text-xs text-muted-foreground">
            Re-runs the agent with this report as prior context.
          </p>
          <Textarea
            name="notes"
            rows={3}
            placeholder="Optional refresh brief (what changed?)"
          />
          <Button type="submit" variant="secondary" disabled={refreshPending}>
            {refreshPending ? "Queuing refresh…" : "Refresh"}
          </Button>
        </form>
      ) : null}

      {feedback ? (
        <Alert variant={pushState.error || refreshState.error ? "destructive" : "default"}>
          <AlertDescription>{feedback}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
