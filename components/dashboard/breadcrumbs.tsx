"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MODULE_NAV } from "@/lib/constants";
import { cn } from "@/lib/utils";

function titleCase(segment: string) {
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function useDashboardCrumbs() {
  const pathname = usePathname();
  const crumbs: { href: string; label: string }[] = [
    { href: "/", label: "Dashboard" },
  ];

  if (pathname === "/") {
    return { pathname, crumbs, pageTitle: "Dashboard" };
  }

  const navModule = MODULE_NAV.find(
    (item) =>
      item.href !== "/" &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );

  if (navModule) {
    crumbs.push({ href: navModule.href, label: navModule.label });
  }

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length > 1) {
    let href = "";
    for (let i = 0; i < parts.length; i += 1) {
      href += `/${parts[i]}`;
      if (navModule && href === navModule.href) continue;
      // Skip opaque ids in crumbs (uuids / cuid-ish)
      if (/^[0-9a-f-]{8,}$/i.test(parts[i]) || parts[i].length > 28) {
        crumbs.push({ href, label: "Detail" });
        continue;
      }
      crumbs.push({ href, label: titleCase(parts[i]) });
    }
  }

  const pageTitle = crumbs[crumbs.length - 1]?.label ?? "Dashboard";
  return { pathname, crumbs, pageTitle };
}

export function Breadcrumbs({ className }: { className?: string }) {
  const { crumbs } = useDashboardCrumbs();

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.href}-${index}`} className="flex items-center gap-1.5">
              {index > 0 ? (
                <span aria-hidden className="text-ink-soft/60">
                  /
                </span>
              ) : null}
              {last ? (
                <span className="truncate font-medium text-ink">{crumb.label}</span>
              ) : (
                <Link
                  href={crumb.href}
                  className="truncate transition-colors hover:text-primary"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
