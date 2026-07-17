import Link from "next/link";

export function DataNav({ current }: { current: string }) {
  const items = [
    { href: "/data", label: "Dashboard" },
    { href: "/data/settings", label: "Settings" },
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
