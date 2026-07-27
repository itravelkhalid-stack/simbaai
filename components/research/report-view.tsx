"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AiContentSurface, SimbaBadge } from "@/components/brand/ai-content";
import { EmptyState } from "@/components/brand/empty-state";
import type { ResearchDocument } from "@/lib/types/research";

export function ResearchReportView({
  documents,
  title,
}: {
  documents: ResearchDocument[];
  title: string;
}) {
  if (!documents.length) {
    return (
      <EmptyState
        title="Report not ready"
        description="When this research run finishes, findings will appear here as a readable report."
      />
    );
  }

  const sources = documents.flatMap((doc) =>
    (doc.sources ?? []).map((source) => ({
      ...source,
      section: doc.section,
    })),
  );

  return (
    <article id="research-report" className="mx-auto max-w-[65ch] space-y-8">
      <header className="space-y-3 rounded-lg bg-card p-6 shadow-elevated ring-1 ring-border">
        <SimbaBadge />
        <h2 className="font-heading text-3xl font-bold tracking-tight text-ink">
          {title}
        </h2>
        <nav className="flex flex-wrap gap-2 pt-1">
          {documents.map((doc) => (
            <a
              key={doc.id}
              href={`#section-${doc.id}`}
              className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-brand-soft hover:text-primary"
            >
              {doc.section.replaceAll("_", " ")}
            </a>
          ))}
        </nav>
      </header>

      {documents.map((doc) => (
        <section
          key={doc.id}
          id={`section-${doc.id}`}
          className="scroll-mt-24 space-y-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-heading text-xl font-semibold capitalize text-ink">
              {doc.section.replaceAll("_", " ")}
            </h3>
            {doc.confidence != null ? (
              <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-primary">
                {(Number(doc.confidence) * 100).toFixed(0)}% confidence
              </span>
            ) : null}
          </div>
          <AiContentSurface showBadge={false} className="prose-report">
            <div className="prose prose-neutral max-w-none text-ink prose-headings:font-heading prose-headings:text-ink prose-p:leading-relaxed prose-a:text-primary prose-strong:text-ink">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {doc.content}
              </ReactMarkdown>
            </div>
          </AiContentSurface>
        </section>
      ))}

      {sources.length > 0 ? (
        <section className="space-y-3 border-t border-border pt-6">
          <h3 className="font-heading text-lg font-semibold text-ink">
            Sources
          </h3>
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
