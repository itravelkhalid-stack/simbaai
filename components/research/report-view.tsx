"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AiContentSurface, SimbaBadge } from "@/components/brand/ai-content";
import type { ResearchDocument } from "@/lib/types/research";

export function ResearchReportView({
  documents,
  title,
}: {
  documents: ResearchDocument[];
  title: string;
}) {
  const sources = documents.flatMap((doc) =>
    (doc.sources ?? []).map((source) => ({
      ...source,
      section: doc.section,
    })),
  );

  return (
    <article id="research-report" className="space-y-8">
      <header className="space-y-2">
        <SimbaBadge />
        <h2 className="font-heading text-2xl font-bold tracking-tight text-ink">
          {title}
        </h2>
      </header>

      {documents.map((doc) => (
        <AiContentSurface key={doc.id} showBadge={false} className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-heading text-lg font-semibold capitalize text-ink">
              {doc.section.replaceAll("_", " ")}
            </h3>
            {doc.confidence != null ? (
              <span className="text-xs text-ink-soft">
                confidence {(Number(doc.confidence) * 100).toFixed(0)}%
              </span>
            ) : null}
          </div>
          <div className="prose prose-neutral max-w-none prose-headings:scroll-mt-20 prose-a:text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
          </div>
        </AiContentSurface>
      ))}

      {sources.length > 0 ? (
        <section className="space-y-3 border-t border-border pt-6">
          <h3 className="font-heading text-lg font-semibold">Sources</h3>
          <ul className="space-y-2 text-sm">
            {sources.map((source, index) => (
              <li key={`${source.url}-${index}`}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {source.title || source.url}
                </a>
                <span className="text-ink-soft">
                  {" "}
                  · {source.section.replaceAll("_", " ")}
                  {source.note ? ` — ${source.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
