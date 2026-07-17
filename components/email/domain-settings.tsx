"use client";

import { useActionState } from "react";

import {
  addSendingDomain,
  refreshSendingDomain,
  updateSendingDomainDetails,
  type EmailActionResult,
} from "@/lib/email/actions";
import type { EmailSendingDomain } from "@/lib/types/email";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: EmailActionResult = {};

export function DomainSettings({ domains }: { domains: EmailSendingDomain[] }) {
  const [createState, createAction, creating] = useActionState(
    addSendingDomain,
    initial,
  );
  const [updateState, updateAction, updating] = useActionState(
    updateSendingDomainDetails,
    initial,
  );

  return (
    <div className="space-y-6">
      <form action={createAction} className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-medium">Add sending domain</p>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="domain">Domain</Label>
            <Input id="domain" name="domain" placeholder="mail.example.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fromName">From name</Label>
            <Input id="fromName" name="fromName" placeholder="Acme Marketing" />
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label htmlFor="physicalAddress">Physical address (required in footers)</Label>
            <Textarea
              id="physicalAddress"
              name="physicalAddress"
              rows={2}
              placeholder="123 Main St, City, Country"
            />
          </div>
        </div>
        {createState.error || createState.success ? (
          <Alert variant={createState.error ? "destructive" : "default"}>
            <AlertDescription>
              {createState.error || createState.success}
            </AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={creating}>
          {creating ? "Creating…" : "Add domain"}
        </Button>
      </form>

      {domains.map((domain) => (
        <div key={domain.id} className="space-y-4 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">{domain.domain}</p>
              <p className="text-sm text-muted-foreground">
                Status: {domain.status}
                {domain.verified_at
                  ? ` · verified ${new Date(domain.verified_at).toLocaleString()}`
                  : ""}
              </p>
            </div>
            <form action={refreshSendingDomain}>
              <input type="hidden" name="domainId" value={domain.id} />
              <Button type="submit" variant="outline" size="sm">
                Refresh verification
              </Button>
            </form>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">DNS records</p>
            {domain.dns_records.length === 0 ? (
              <p className="text-sm text-muted-foreground">No records returned yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="p-2">Type</th>
                      <th className="p-2">Name</th>
                      <th className="p-2">Value</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domain.dns_records.map((record, idx) => (
                      <tr key={idx} className="border-b align-top">
                        <td className="p-2 font-mono">
                          {String(record.record ?? record.type ?? "—")}
                        </td>
                        <td className="break-all p-2 font-mono">
                          {String(record.name ?? "—")}
                        </td>
                        <td className="break-all p-2 font-mono">
                          {String(record.value ?? record.content ?? "—")}
                        </td>
                        <td className="p-2">
                          {String(record.status ?? "pending")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <form action={updateAction} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="domainId" value={domain.id} />
            <div className="space-y-2">
              <Label htmlFor={`fromName-${domain.id}`}>From name</Label>
              <Input
                id={`fromName-${domain.id}`}
                name="fromName"
                defaultValue={domain.from_name ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`fromEmail-${domain.id}`}>From email</Label>
              <Input
                id={`fromEmail-${domain.id}`}
                name="fromEmail"
                defaultValue={domain.from_email ?? ""}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`address-${domain.id}`}>Physical address</Label>
              <Textarea
                id={`address-${domain.id}`}
                name="physicalAddress"
                rows={2}
                defaultValue={domain.physical_address ?? ""}
              />
            </div>
            {updateState.error || updateState.success ? (
              <Alert
                className="md:col-span-2"
                variant={updateState.error ? "destructive" : "default"}
              >
                <AlertDescription>
                  {updateState.error || updateState.success}
                </AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={updating} className="md:col-span-2 w-fit">
              {updating ? "Saving…" : "Save domain details"}
            </Button>
          </form>
        </div>
      ))}
    </div>
  );
}
