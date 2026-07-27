export const ACTIVE_ORG_COOKIE = "growthos_active_org";
export const IMPERSONATE_ORG_COOKIE = "growthos_impersonate_org";

export const MODULE_NAV = [
  { href: "/", label: "Dashboard", module: "dashboard" },
  { href: "/team", label: "AI Team", module: "team" },
  { href: "/ask", label: "Ask", module: "ask" },
  { href: "/brand", label: "Brand", module: "brand" },
  { href: "/research", label: "Research", module: "research" },
  { href: "/content", label: "Content", module: "content" },
  { href: "/social", label: "Social", module: "social" },
  { href: "/email", label: "Email", module: "email" },
  { href: "/ads", label: "Ads", module: "ads" },
  { href: "/seo", label: "SEO", module: "seo" },
  { href: "/planning", label: "Planning", module: "planning" },
  { href: "/meetings", label: "Meetings", module: "meetings" },
  { href: "/reviews", label: "Reviews", module: "reviews" },
  { href: "/crm", label: "CRM", module: "crm" },
  { href: "/finance", label: "Finance", module: "finance" },
  { href: "/operations", label: "Operations", module: "operations" },
  { href: "/data", label: "Data", module: "data" },
  { href: "/compliance", label: "Compliance", module: "compliance" },
  { href: "/automations", label: "Automations", module: "automations" },
  { href: "/settings", label: "Settings", module: "settings" },
] as const;

export const INVITE_ROLES = [
  "org_admin",
  "org_member",
  "org_viewer",
] as const;
