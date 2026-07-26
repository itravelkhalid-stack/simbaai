import { Resend } from "resend";

import type { Report, ReportContent } from "@/lib/types/reviews";
import { REPORT_TYPE_LABELS } from "@/lib/types/reviews";

export async function emailReport(params: {
  report: Pick<Report, "title" | "type" | "period_start" | "period_end" | "pdf_url">;
  content: ReportContent;
  recipients: string[];
}): Promise<string[]> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from || !params.recipients.length) return [];

  const resend = new Resend(apiKey);
  const brand = params.content.branding?.brand_name ?? "Brand";
  const headlines = (params.content.headline_numbers ?? [])
    .slice(0, 6)
    .map((h) => {
      const delta =
        h.delta_pct == null
          ? ""
          : ` (${h.delta_pct > 0 ? "+" : ""}${h.delta_pct}%)`;
      return `<li><strong>${h.label}:</strong> ${h.value}${h.unit}${delta}</li>`;
    })
    .join("");

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 640px; margin: 0 auto;">
      <h1 style="color:${params.content.branding?.primary_color ?? "#0f766e"}">${params.report.title}</h1>
      <p>${brand} · ${REPORT_TYPE_LABELS[params.report.type]} · ${params.report.period_start} → ${params.report.period_end}</p>
      <p>${params.content.summary}</p>
      <h2>Headline numbers</h2>
      <ul>${headlines}</ul>
      <h2>Insights</h2>
      <ul>${(params.content.insights ?? []).map((i) => `<li>${i}</li>`).join("")}</ul>
      <h2>Recommendations</h2>
      <ul>${(params.content.recommendations ?? []).map((i) => `<li>${i}</li>`).join("")}</ul>
      ${
        params.report.pdf_url
          ? `<p><a href="${params.report.pdf_url}">Download PDF</a></p>`
          : ""
      }
      <p style="color:#888;font-size:12px;">Sent by Simba AI Reviews</p>
    </div>
  `;

  const sent: string[] = [];
  for (const to of params.recipients) {
    const email = to.trim();
    if (!email.includes("@")) continue;
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: `${REPORT_TYPE_LABELS[params.report.type]} report: ${params.report.title}`,
      html,
    });
    if (!error) sent.push(email);
  }
  return sent;
}
