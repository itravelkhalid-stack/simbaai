import {
  createAnnouncement,
  deactivateAnnouncement,
} from "@/lib/admin/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export default async function AdminAnnouncementsPage() {
  const admin = createAdminClient();
  const { data: announcements } = await admin
    .from("platform_announcements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Announcements</h2>
        <p className="mt-1 text-muted-foreground">
          Banners shown across client dashboards while active.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New announcement</CardTitle>
          <CardDescription>Visible immediately when active.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAnnouncement} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Body</Label>
              <Textarea id="body" name="body" rows={3} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="severity">Severity</Label>
              <Input
                id="severity"
                name="severity"
                defaultValue="info"
                placeholder="info | warning | critical"
              />
            </div>
            <Button type="submit">Publish</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(announcements ?? []).map((a) => (
          <Card key={a.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{a.title}</CardTitle>
                  <Badge variant={a.active ? "default" : "secondary"}>
                    {a.active ? "active" : "inactive"}
                  </Badge>
                  <Badge variant="outline">{a.severity}</Badge>
                </div>
                <CardDescription className="mt-2 whitespace-pre-wrap">
                  {a.body}
                </CardDescription>
              </div>
              {a.active ? (
                <form action={deactivateAnnouncement}>
                  <input type="hidden" name="id" value={a.id} />
                  <Button type="submit" size="sm" variant="outline">
                    Deactivate
                  </Button>
                </form>
              ) : null}
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
