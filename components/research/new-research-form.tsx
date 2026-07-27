"use client";
import { fieldSelectClass } from "@/lib/ui/field";

import { useActionState, useState } from "react";

import { startResearch, type ResearchActionResult } from "@/lib/research/actions";
import { RESEARCH_TYPE_LABELS, type ResearchProjectType } from "@/lib/types/research";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: ResearchActionResult = {};

const TYPES = Object.keys(RESEARCH_TYPE_LABELS) as ResearchProjectType[];

export function NewResearchForm() {
  const [type, setType] = useState<ResearchProjectType>("brand_audit");
  const [state, formAction, pending] = useActionState(startResearch, initial);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="type">Research type</Label>
        <select
          id="type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as ResearchProjectType)}
          className={fieldSelectClass}
        >
          {TYPES.map((value) => (
            <option key={value} value={value}>
              {RESEARCH_TYPE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          required
          placeholder={`${RESEARCH_TYPE_LABELS[type]} — Q3`}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Brief</Label>
        <Textarea
          id="notes"
          name="notes"
          required
          rows={5}
          placeholder="Goals, geography, niche, known competitors, questions to answer…"
        />
      </div>

      {type === "competitor" ? (
        <div className="space-y-3 rounded-xl border p-4">
          <div className="space-y-2">
            <Label htmlFor="competitorUrls">Competitor URLs (optional)</Label>
            <Textarea
              id="competitorUrls"
              name="competitorUrls"
              rows={3}
              placeholder={"https://competitor-a.com\nhttps://competitor-b.com"}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="discoverTop5"
              defaultChecked
              className="size-4 rounded border"
            />
            Discover top 5 in niche if URLs are incomplete
          </label>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="model">Model override (optional)</Label>
        <Input
          id="model"
          name="model"
          placeholder="claude-sonnet-4-6"
        />
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Queuing…" : "Start research agent"}
      </Button>
    </form>
  );
}
