import { Badge } from "@/components/ui/badge";
import type {
  ComplianceCheck,
  ComplianceFinding,
} from "@/lib/types/compliance";

const SEVERITY_CLASS: Record<string, string> = {
  critical: "bg-red-600 text-white hover:bg-red-600",
  warning: "bg-amber-500 text-white hover:bg-amber-500",
  info: "bg-slate-500 text-white hover:bg-slate-500",
};

export function FindingBadges({ findings }: { findings: ComplianceFinding[] }) {
  if (!findings.length) {
    return (
      <Badge variant="secondary" className="bg-emerald-600 text-white">
        pass
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {findings.map((f, i) => (
        <Badge
          key={`${f.code}-${i}`}
          className={SEVERITY_CLASS[f.severity] ?? SEVERITY_CLASS.warning}
        >
          {f.severity}: {f.code}
        </Badge>
      ))}
    </div>
  );
}

export function ComplianceFindingsPanel({
  check,
  showOverrideField = false,
}: {
  check: ComplianceCheck | null;
  showOverrideField?: boolean;
}) {
  if (!check) {
    return (
      <p className="text-sm text-muted-foreground">
        No compliance check recorded yet for this item.
      </p>
    );
  }

  const findings = check.findings ?? [];
  const blocked = check.status === "fail" && !check.override_by;

  return (
    <div
      className={`space-y-3 rounded-xl border p-4 ${
        blocked
          ? "border-red-500/40"
          : check.status === "warn"
            ? "border-amber-500/40"
            : "border-emerald-500/30"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Compliance · {check.status.toUpperCase()}
          {check.override_by ? " (overridden)" : ""}
        </p>
        <FindingBadges findings={findings} />
      </div>
      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No findings.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {findings.map((f, i) => (
            <li key={`${f.code}-${i}`} className="rounded-lg border p-2">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge className={SEVERITY_CLASS[f.severity]}>
                  {f.severity}
                </Badge>
                <span className="font-medium">{f.code}</span>
              </div>
              <p>{f.message}</p>
              {f.suggestion ? (
                <p className="mt-1 text-muted-foreground">{f.suggestion}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {check.override_reason ? (
        <p className="text-xs text-muted-foreground">
          Override: {check.override_reason}
        </p>
      ) : null}
      {blocked && showOverrideField ? (
        <div className="space-y-1 border-t pt-3">
          <label className="text-xs font-medium text-muted-foreground">
            Org admin override reason (required to approve fails)
          </label>
          <input
            name="overrideReason"
            placeholder="Logged reason for override…"
            className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Checked {new Date(check.checked_at).toLocaleString()}
      </p>
    </div>
  );
}
