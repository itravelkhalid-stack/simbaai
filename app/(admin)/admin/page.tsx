import Link from "next/link";

import { startImpersonation } from "@/lib/admin/actions";
import { listOrgsWithUsage } from "@/lib/admin/ops";
import { formatPence } from "@/lib/ads/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AdminOrgsPage() {
  const rows = await listOrgsWithUsage();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Organizations</h2>
        <p className="mt-1 text-muted-foreground">
          Plan, usage, and AI cost across tenants. Impersonation is audited.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All orgs</CardTitle>
          <CardDescription>{rows.length} organizations</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>AI runs</TableHead>
                <TableHead>AI spend (mo)</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ org, plan, limits, usage }) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <div className="font-medium">{org.name}</div>
                    <div className="text-xs text-muted-foreground">{org.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{plan}</Badge>
                  </TableCell>
                  <TableCell>
                    {usage.ai_runs_month}
                    {limits.ai_runs_month != null
                      ? ` / ${limits.ai_runs_month}`
                      : ""}
                  </TableCell>
                  <TableCell>{formatPence(usage.ai_spend_pence)}</TableCell>
                  <TableCell>
                    {usage.team_members}
                    {limits.team_members != null
                      ? ` / ${limits.team_members}`
                      : ""}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Link
                      href={`/admin/orgs/${org.id}`}
                      className="text-sm underline-offset-4 hover:underline"
                    >
                      Manage
                    </Link>
                    <form action={startImpersonation} className="inline">
                      <input type="hidden" name="organizationId" value={org.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Impersonate
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    No organizations yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
