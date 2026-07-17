"use client";

import { useActionState, useState } from "react";

import {
  generateKeywordStrategy,
  saveKeywordMap,
  type SeoActionResult,
} from "@/lib/seo/actions";
import type { SeoKeywordMap } from "@/lib/types/seo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initial: SeoActionResult = {};

export function KeywordMapEditor({
  projectId,
  map,
}: {
  projectId: string;
  map: SeoKeywordMap;
}) {
  const [json, setJson] = useState(JSON.stringify(map, null, 2));
  const [genState, genAction, generating] = useActionState(
    generateKeywordStrategy,
    initial,
  );
  const [saveState, saveAction, saving] = useActionState(saveKeywordMap, initial);

  return (
    <div className="space-y-4">
      <form action={genAction}>
        <input type="hidden" name="projectId" value={projectId} />
        <Button type="submit" disabled={generating}>
          {generating ? "Generating…" : "AI keyword strategy"}
        </Button>
      </form>
      {genState.error || genState.success ? (
        <Alert variant={genState.error ? "destructive" : "default"}>
          <AlertDescription>{genState.error || genState.success}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-medium">Pillar / cluster tree</p>
        <ul className="space-y-3 text-sm">
          {(map.pillars ?? []).map((pillar) => (
            <li key={pillar.id} className="rounded-lg border p-3">
              <p className="font-medium">
                {pillar.name}{" "}
                <span className="text-muted-foreground">
                  ({pillar.primary_keyword})
                </span>
              </p>
              <ul className="mt-2 space-y-2 pl-3">
                {pillar.clusters.map((cluster) => (
                  <li key={cluster.id}>
                    <p className="text-muted-foreground">{cluster.name}</p>
                    <p>{cluster.keywords.join(" · ")}</p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {map.notes ? (
          <p className="text-sm text-muted-foreground">{map.notes}</p>
        ) : null}
      </div>

      <form action={saveAction} className="space-y-3 rounded-xl border p-4">
        <input type="hidden" name="projectId" value={projectId} />
        <Textarea
          name="keywordMap"
          rows={16}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          className="font-mono text-xs"
        />
        {saveState.error || saveState.success ? (
          <Alert variant={saveState.error ? "destructive" : "default"}>
            <AlertDescription>
              {saveState.error || saveState.success}
            </AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" variant="outline" disabled={saving}>
          {saving ? "Saving…" : "Save map JSON"}
        </Button>
      </form>
    </div>
  );
}
