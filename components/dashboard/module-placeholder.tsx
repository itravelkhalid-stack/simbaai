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
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
        Placeholder for the {title} module in{" "}
        <span className="font-medium text-foreground">
          {active.organization.name}
        </span>
        . AI agent workflows for this surface land here next.
      </div>
    </div>
  );
}
