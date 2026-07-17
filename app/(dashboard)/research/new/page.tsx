import Link from "next/link";

import { NewResearchForm } from "@/components/research/new-research-form";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireActiveOrg } from "@/lib/org/require";

export default async function NewResearchPage() {
  const { active } = await requireActiveOrg();

  if (active.role === "org_viewer") {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">New research</h1>
        <p className="text-muted-foreground">
          Viewers cannot start research. Ask an admin to invite you with a member role.
        </p>
        <Link href="/research" className="underline">
          Back to library
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/research" className="text-sm text-muted-foreground underline">
          ← Research library
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">New research</h1>
        <p className="mt-2 text-muted-foreground">
          Agents run in the background with Claude + web search, then land in your
          library with sources and recommended actions.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Brief the agent</CardTitle>
          <CardDescription>
            Every report includes an executive summary and recommended actions for Planning.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <NewResearchForm />
        </div>
      </Card>
    </div>
  );
}
