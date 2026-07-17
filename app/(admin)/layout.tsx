import Link from "next/link";
import { redirect } from "next/navigation";

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
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              GrowthOS
            </p>
            <h1 className="text-lg font-semibold">Platform admin</h1>
          </div>
          <nav className="flex flex-wrap items-center gap-2">
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-slate-100 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-slate-100"
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
