import { PageHeader } from "@/components/dashboard/page-header";
import { requireActiveOrg } from "@/lib/org/require";

export async function ModulePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { active } = await requireActiveOrg();

  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <div className="rounded-lg border border-dashed border-border p-8 text-sm text-ink-soft">
        Placeholder for the {title} module in{" "}
        <span className="font-medium text-ink">{active.organization.name}</span>
        . AI agent workflows for this surface land here next.
      </div>
    </div>
  );
}
