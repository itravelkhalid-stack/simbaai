import Link from "next/link";
import { redirect } from "next/navigation";

import { SimbaWordmark } from "@/components/brand/simba-wordmark";
import { requireUser } from "@/lib/org/require";
import { isPlatformAdminUser } from "@/lib/org/session";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { href: "/admin", label: "Organizations" },
  { href: "/admin/agents", label: "Agent monitor" },
  { href: "/admin/jobs", label: "Dead letters" },
  { href: "/admin/announcements", label: "Announcements" },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireUser();
  const ok = await isPlatformAdminUser(user.id);
  if (!ok) redirect("/");

  return (
    <div className="min-h-screen bg-surface-soft">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="space-y-1">
            <SimbaWordmark size="sm" />
            <h1 className="font-heading text-lg font-semibold text-ink">
              Platform admin
            </h1>
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-brand-soft hover:text-primary",
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-soft"
            >
              Exit to app
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
