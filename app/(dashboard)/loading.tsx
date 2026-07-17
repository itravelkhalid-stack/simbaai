export default function DashboardLoading() {
  return (
    <div className="space-y-4 animate-pulse p-6 md:p-8">
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="h-4 w-96 max-w-full rounded bg-muted" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-32 rounded-lg bg-muted" />
        <div className="h-32 rounded-lg bg-muted" />
      </div>
    </div>
  );
}
