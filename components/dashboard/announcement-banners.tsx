import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function AnnouncementBanners({
  items,
}: {
  items: Array<{
    id: string;
    title: string;
    body: string;
    severity: string;
  }>;
}) {
  if (!items.length) return null;

  return (
    <div className="mb-4 space-y-2">
      {items.map((a) => (
        <Alert
          key={a.id}
          variant={a.severity === "critical" ? "destructive" : "default"}
        >
          <AlertTitle>{a.title}</AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">{a.body}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
