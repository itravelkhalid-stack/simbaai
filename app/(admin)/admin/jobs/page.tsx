import {
  discardDeadLetter,
  resolveDeadLetter,
  retryDeadLetter,
} from "@/lib/admin/dead-letter-actions";
import { listOpenDeadLetters } from "@/lib/jobs/dead-letter";
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

export default async function AdminJobsPage() {
  const rows = await listOpenDeadLetters(100);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Dead-letter queue</h2>
        <p className="mt-1 text-muted-foreground">
          Failed background jobs awaiting retry or discard.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open / retrying</CardTitle>
          <CardDescription>{rows.length} items</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>{r.provider}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.job_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.event_name ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {r.error}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.status}</Badge>
                  </TableCell>
                  <TableCell className="space-x-1 text-right">
                    <form action={retryDeadLetter} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Retry
                      </Button>
                    </form>
                    <form action={resolveDeadLetter} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        Resolve
                      </Button>
                    </form>
                    <form action={discardDeadLetter} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" size="sm" variant="destructive">
                        Discard
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Queue empty.
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
