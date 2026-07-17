import { redirect } from "next/navigation";

import { AnnouncementBanners } from "@/components/dashboard/announcement-banners";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { IntegrationHealthBanners } from "@/components/dashboard/integration-health-banners";
import { Sidebar } from "@/components/dashboard/sidebar";
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
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef2ff,_#f8fafc_45%,_#f1f5f9)]">
        {children}
      </div>
    );
  }

  const [{ data: notifications }, { data: announcements }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, body, link, read_at, created_at, category, organization_id")
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
  ]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        memberships={memberships}
        activeOrganizationId={active.organization_id}
        profile={profile}
        email={user.email ?? ""}
      />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-6xl p-6 md:p-8">
          <DashboardHeader
            userId={user.id}
            organizationId={active.organization_id}
            orgName={active.organization.name}
            notifications={notifications ?? []}
            impersonating={Boolean(active.impersonating)}
            isPlatformAdmin={isPlatformAdmin}
          />
          <AnnouncementBanners items={announcements ?? []} />
          <IntegrationHealthBanners />
          {children}
        </div>
      </main>
    </div>
  );
}
