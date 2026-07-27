"use client";
import { fieldSelectClass } from "@/lib/ui/field";

import { useMemo, useState } from "react";
import { useActionState } from "react";

import { importSubscribersAction, type EmailActionResult } from "@/lib/email/actions";
import type { EmailList } from "@/lib/types/email";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const initial: EmailActionResult = {};

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { headers: [] as string[], rows: [] as Array<Record<string, string>> };
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cols[index] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

export function CsvImportForm({ lists }: { lists: EmailList[] }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({
    email: "",
    first_name: "",
    last_name: "",
  });
  const [state, action, pending] = useActionState(importSubscribersAction, initial);

  const mappingJson = useMemo(() => JSON.stringify(mapping), [mapping]);
  const rowsJson = useMemo(() => JSON.stringify(rows), [rows]);

  return (
    <form action={action} className="space-y-4 rounded-xl border p-4">
      <input type="hidden" name="mapping" value={mappingJson} />
      <input type="hidden" name="rows" value={rowsJson} />

      <div className="space-y-2">
        <Label htmlFor="listId">Target list</Label>
        <select
          id="listId"
          name="listId"
          required
          className={fieldSelectClass}
        >
          <option value="">Select list</option>
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="csv">CSV file</Label>
        <input
          id="csv"
          type="file"
          accept=".csv,text/csv"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            const parsed = parseCsv(text);
            setHeaders(parsed.headers);
            setRows(parsed.rows);
            setMapping((prev) => ({
              ...prev,
              email:
                parsed.headers.find((h) => /email/i.test(h)) ??
                parsed.headers[0] ??
                "",
              first_name:
                parsed.headers.find((h) => /first/i.test(h)) ?? prev.first_name,
              last_name:
                parsed.headers.find((h) => /last/i.test(h)) ?? prev.last_name,
            }));
          }}
        />
        <p className="text-xs text-muted-foreground">
          {rows.length} rows parsed · duplicates on the same list are upserted ·
          suppressed emails are skipped
        </p>
      </div>

      {headers.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-3">
          {(["email", "first_name", "last_name"] as const).map((field) => (
            <div key={field} className="space-y-2">
              <Label>{field}</Label>
              <select
                className={fieldSelectClass}
                value={mapping[field] ?? ""}
                onChange={(e) =>
                  setMapping((prev) => ({ ...prev, [field]: e.target.value }))
                }
              >
                <option value="">—</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ) : null}

      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription>{state.error || state.success}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={pending || rows.length === 0}>
        {pending ? "Importing…" : "Import subscribers"}
      </Button>
    </form>
  );
}
