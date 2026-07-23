"use client";

import { useActionState } from "react";

import {
  selectMetaPage,
  type MetaSelectResult,
} from "@/lib/social/meta-actions";
import type { MetaPageOption } from "@/lib/social/meta-scopes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const initial: MetaSelectResult = {};

export function MetaPagePicker({
  sessionId,
  pages,
}: {
  sessionId: string;
  pages: MetaPageOption[];
}) {
  const [state, action, pending] = useActionState(selectMetaPage, initial);

  return (
    <div className="space-y-4">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {pages.length === 0 ? (
        <Alert variant="destructive">
          <AlertDescription>
            No Facebook Pages were returned for this account.
          </AlertDescription>
        </Alert>
      ) : null}

      <ul className="space-y-3">
        {pages.map((page) => (
          <li
            key={page.page_id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
          >
            <div className="space-y-1">
              <p className="font-medium">{page.page_name}</p>
              <p className="text-sm text-muted-foreground">
                Page ID {page.page_id}
              </p>
              {page.ig_user_id ? (
                <Badge variant="secondary">
                  IG @{page.ig_username || page.ig_user_id}
                </Badge>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No Instagram Business account linked
                </p>
              )}
            </div>
            <form action={action}>
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="pageId" value={page.page_id} />
              <Button type="submit" disabled={pending} size="sm">
                {pending ? "Saving…" : "Use this Page"}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
