import Link from "next/link";

export function ComplianceNav({ current }: { current: string }) {
  const items = [
    { href: "/compliance", label: "Overview" },
    { href: "/compliance/profile", label: "Profile" },
    { href: "/compliance/audit", label: "Audit log" },
    { href: "/compliance/data", label: "Data & GDPR" },
  ];
  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`rounded-md border px-3 py-1.5 text-sm ${
            current === item.href ? "bg-foreground text-background" : ""
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
