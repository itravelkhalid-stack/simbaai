"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
      <header className="space-y-1">
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
          GrowthOS Research
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      </header>

      {documents.map((doc) => (
        <section key={doc.id} className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-lg font-semibold capitalize">
              {doc.section.replaceAll("_", " ")}
            </h3>
            {doc.confidence != null ? (
              <span className="text-xs text-muted-foreground">
                confidence {(Number(doc.confidence) * 100).toFixed(0)}%
              </span>
            ) : null}
          </div>
          <div className="prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-20 prose-a:text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
          </div>
        </section>
      ))}

      {sources.length > 0 ? (
        <section className="space-y-3 border-t pt-6">
          <h3 className="text-lg font-semibold">Sources</h3>
          <ul className="space-y-2 text-sm">
            {sources.map((source, index) => (
              <li key={`${source.url}-${index}`}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {source.title || source.url}
                </a>
                <span className="text-muted-foreground">
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
