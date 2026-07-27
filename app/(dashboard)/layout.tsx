import { redirect } from "next/navigation";

import { AnnouncementBanners } from "@/components/dashboard/announcement-banners";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { IntegrationHealthBanners } from "@/components/dashboard/integration-health-banners";
import { loadWorkspaceTheme } from "@/lib/brand/load-workspace-theme";
import {
  getCurrentProfile,
  resolveActiveOrganization,
} from "@/lib/org/session";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { memberships, active, isPlatformAdmin } =
    await resolveActiveOrganization(user.id);
  const profile = await getCurrentProfile(user.id);

  if (!active) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_var(--sem-accent-soft),_var(--sem-surface-soft)_45%,_var(--sem-highlight))]">
        {children}
      </div>
    );
  }

  const [{ data: notifications }, { data: announcements }, workspaceTheme] =
    await Promise.all([
      supabase
        .from("notifications")
        .select(
          "id, title, body, link, read_at, created_at, category, organization_id",
        )
        .eq("user_id", user.id)
        .eq("organization_id", active.organization_id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("platform_announcements")
        .select("id, title, body, severity")
        .eq("active", true)
        .order("starts_at", { ascending: false })
        .limit(5),
      loadWorkspaceTheme(active.organization_id, active.organization.name),
    ]);

  return (
    <DashboardShell
      memberships={memberships}
      activeOrganizationId={active.organization_id}
      profile={profile}
      email={user.email ?? ""}
      userId={user.id}
      organizationId={active.organization_id}
      orgName={active.organization.name}
      notifications={notifications ?? []}
      impersonating={Boolean(active.impersonating)}
      isPlatformAdmin={isPlatformAdmin}
      workspaceTheme={workspaceTheme}
      banners={
        <>
          <AnnouncementBanners items={announcements ?? []} />
          <IntegrationHealthBanners />
        </>
      }
    >
      {children}
    </DashboardShell>
  );
}
