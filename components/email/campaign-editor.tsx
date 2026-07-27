"use client";

import { useActionState, useMemo, useState } from "react";

import {
  saveCampaignDraft,
  scheduleCampaign,
  type EmailActionResult,
} from "@/lib/email/actions";
import { BlockEmailEditor } from "@/components/email/block-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  EmailBlock,
  EmailCampaign,
  EmailList,
  EmailSegment,
  EmailSendingDomain,
} from "@/lib/types/email";
import { fieldCheckboxClass, fieldSelectClass } from "@/lib/ui/field";

const initial: EmailActionResult = {};

export function CampaignEditor({
  campaign,
  lists,
  segments,
  domains,
}: {
  campaign: EmailCampaign;
  lists: EmailList[];
  segments: EmailSegment[];
  domains: EmailSendingDomain[];
}) {
  const [blocks, setBlocks] = useState<EmailBlock[]>(campaign.blocks ?? []);
  const [selectedLists, setSelectedLists] = useState<string[]>(campaign.list_ids ?? []);
  const [state, action, pending] = useActionState(saveCampaignDraft, initial);

  const blocksJson = useMemo(() => JSON.stringify(blocks), [blocks]);

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <input type="hidden" name="campaignId" value={campaign.id} />
        <input type="hidden" name="blocks" value={blocksJson} />
        <input type="hidden" name="listIds" value={selectedLists.join(",")} />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Campaign name</Label>
            <Input id="name" name="name" defaultValue={campaign.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Primary subject</Label>
            <Input id="subject" name="subject" defaultValue={campaign.subject} required />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="subjectVariants">Subject variants (A/B — one per line)</Label>
          <Textarea
            id="subjectVariants"
            name="subjectVariants"
            rows={3}
            defaultValue={(campaign.subject_variants ?? []).join("\n")}
          />
          <label className="flex items-center gap-2 text-sm">
            <input className={fieldCheckboxClass} type="checkbox" name="abTest" defaultChecked={campaign.ab_test} />
            Enable subject A/B split on send
          </label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="preheader">Preheader</Label>
          <Input id="preheader" name="preheader" defaultValue={campaign.preheader ?? ""} />
        </div>

        <div className="space-y-2">
          <Label>Lists</Label>
          <div className="flex flex-wrap gap-3">
            {lists.map((list) => (
              <label key={list.id} className="flex items-center gap-2 text-sm">
                <input
                  className={fieldCheckboxClass}
                  type="checkbox"
                  checked={selectedLists.includes(list.id)}
                  onChange={(e) => {
                    setSelectedLists((prev) =>
                      e.target.checked
                        ? [...prev, list.id]
                        : prev.filter((id) => id !== list.id),
                    );
                  }}
                />
                {list.name}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="segmentId">Segment (optional)</Label>
            <select
              id="segmentId"
              name="segmentId"
              defaultValue={campaign.segment_id ?? ""}
              className={fieldSelectClass}
            >
              <option value="">All selected list subscribers</option>
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sendingDomainId">Sending domain</Label>
            <select
              id="sendingDomainId"
              name="sendingDomainId"
              defaultValue={campaign.sending_domain_id ?? ""}
              className={fieldSelectClass}
            >
              <option value="">Select domain</option>
              {domains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.domain} ({domain.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        <BlockEmailEditor blocks={blocks} onChange={setBlocks} />

        <p className="text-xs text-muted-foreground">
          A physical address + unsubscribe link are injected automatically into every send.
          They cannot be removed.
        </p>

        {state.error || state.success ? (
          <Alert variant={state.error ? "destructive" : "default"}>
            <AlertDescription>{state.error || state.success}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save draft"}
        </Button>
      </form>

      <form action={scheduleCampaign} className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <input type="hidden" name="campaignId" value={campaign.id} />
        <div className="space-y-2">
          <Label htmlFor="scheduledAt">Schedule send</Label>
          <Input
            id="scheduledAt"
            name="scheduledAt"
            type="datetime-local"
            defaultValue={
              campaign.scheduled_at
                ? new Date(campaign.scheduled_at).toISOString().slice(0, 16)
                : ""
            }
          />
        </div>
        <Button type="submit">Schedule / send now</Button>
      </form>

      <div className="rounded-xl border p-4">
        <p className="mb-2 text-sm font-medium">HTML preview</p>
        <iframe
          title="preview"
          className="h-[480px] w-full rounded-lg border bg-white"
          srcDoc={campaign.html_content}
        />
      </div>
    </div>
  );
}
