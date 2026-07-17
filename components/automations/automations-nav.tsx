import Link from "next/link";

export function AutomationsNav({ current }: { current: string }) {
  const items = [
    { href: "/automations", label: "Automations" },
    { href: "/automations/recipes", label: "Recipes" },
    { href: "/automations/settings", label: "Safety settings" },
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
