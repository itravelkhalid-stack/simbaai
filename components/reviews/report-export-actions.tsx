"use client";

import { useActionState } from "react";
import { jsPDF } from "jspdf";

import {
  sendReportEmail,
  type ReviewsActionResult,
} from "@/lib/reviews/actions";
import type { Report, ReportContent } from "@/lib/types/reviews";
import { REPORT_TYPE_LABELS } from "@/lib/types/reviews";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: ReviewsActionResult = {};

function downloadClientPdf(report: Report, content: ReportContent) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const primary = content.branding?.primary_color ?? "#0f766e";
  let y = 48;
  const write = (text: string, size = 11) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, 500);
    for (const line of lines) {
      if (y > 780) {
        doc.addPage();
        y = 48;
      }
      doc.text(line, 48, y);
      y += size + 3;
    }
  };
  doc.setFillColor(primary);
  doc.rect(0, 0, 595, 36, "F");
  doc.setTextColor("#fff");
  doc.text(`${content.branding?.brand_name ?? "Report"}`, 48, 22);
  doc.setTextColor("#111");
  y = 56;
  write(report.title, 16);
  write(`${REPORT_TYPE_LABELS[report.type]} · ${report.period_start} → ${report.period_end}`, 10);
  write(content.summary);
  write("Headlines", 13);
  for (const h of content.headline_numbers ?? []) {
    write(
      `${h.label}: ${h.value}${h.unit} (Δ ${h.delta_pct ?? "n/a"}%)`,
    );
  }
  write("Insights", 13);
  for (const i of content.insights ?? []) write(`• ${i}`);
  write("Recommendations", 13);
  for (const r of content.recommendations ?? []) write(`• ${r}`);
  doc.save(`${report.title.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

export function ReportExportActions({
  report,
  content,
  defaultRecipients,
}: {
  report: Report;
  content: ReportContent;
  defaultRecipients: string[];
}) {
  const [state, action, pending] = useActionState(sendReportEmail, initial);

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => downloadClientPdf(report, content)}
        >
          Export PDF
        </Button>
        {report.pdf_url ? (
          <a
            href={report.pdf_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm"
          >
            Open stored PDF
          </a>
        ) : null}
      </div>
      <form action={action} className="flex flex-1 flex-wrap items-end gap-2">
        <input type="hidden" name="reportId" value={report.id} />
        <Input
          name="recipients"
          placeholder="email@client.com, other@…"
          defaultValue={defaultRecipients.join(", ")}
          className="min-w-[220px] flex-1"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Email report"}
        </Button>
      </form>
      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"} className="w-full">
          <AlertDescription>{state.error || state.success}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
