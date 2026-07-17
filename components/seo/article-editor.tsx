"use client";

import { useActionState } from "react";

import { ComplianceFindingsPanel } from "@/components/compliance/findings-panel";
import {
  approveArticle,
  saveArticleDraft,
  type SeoActionResult,
} from "@/lib/seo/actions";
import type { ComplianceCheck } from "@/lib/types/compliance";
import type { SeoArticle, SeoArticleChecklist } from "@/lib/types/seo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: SeoActionResult = {};

export function ArticleEditor({
  article,
  complianceCheck,
  canOverride,
}: {
  article: SeoArticle;
  complianceCheck: ComplianceCheck | null;
  canOverride: boolean;
}) {
  const [state, action, pending] = useActionState(saveArticleDraft, initial);
  const checklist = article.checklist as SeoArticleChecklist;
  const blocked =
    complianceCheck?.status === "fail" && !complianceCheck.override_by;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <form action={action} className="space-y-4">
        <input type="hidden" name="articleId" value={article.id} />
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" defaultValue={article.title} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="content">Markdown</Label>
          <Textarea
            id="content"
            name="content"
            rows={28}
            defaultValue={article.content_markdown}
            className="font-mono text-sm"
            required
          />
        </div>
        {state.error || state.success ? (
          <Alert variant={state.error ? "destructive" : "default"}>
            <AlertDescription>{state.error || state.success}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save & re-score"}
        </Button>
      </form>

      <div className="space-y-4">
        <ComplianceFindingsPanel check={complianceCheck} />

        <div className="rounded-xl border p-4">
          <p className="text-sm font-medium">On-page checklist</p>
          <p className="mt-1 text-3xl font-semibold">
            {article.checklist_score ?? checklist?.score ?? 0}
            <span className="text-base text-muted-foreground">/100</span>
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {(checklist?.checks ?? []).map((check) => (
              <li key={check.id} className="flex gap-2">
                <span>{check.passed ? "✓" : "○"}</span>
                <span>
                  {check.label}
                  {check.detail ? (
                    <span className="block text-xs text-muted-foreground">
                      {check.detail}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {article.status === "review" || article.status === "draft" ? (
          <form action={approveArticle} className="space-y-3 rounded-xl border p-4">
            <input type="hidden" name="articleId" value={article.id} />
            <div className="space-y-2">
              <Label htmlFor="publishedUrl">Published URL (optional)</Label>
              <Input
                id="publishedUrl"
                name="publishedUrl"
                placeholder="https://..."
                defaultValue={article.published_url ?? ""}
              />
            </div>
            {blocked && canOverride ? (
              <Input
                name="overrideReason"
                placeholder="Admin override reason"
                required
              />
            ) : null}
            <Button type="submit" disabled={blocked && !canOverride}>
              {blocked && !canOverride
                ? "Blocked — needs admin"
                : "Approve"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Status: {article.status}</p>
        )}
      </div>
    </div>
  );
}
