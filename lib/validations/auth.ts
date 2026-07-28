import { z } from "zod";

import { INVITE_ROLES } from "@/lib/constants";

export const emailSchema = z.string().trim().email("Enter a valid email");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name"),
  email: emailSchema,
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, "Organization name is required"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens"),
});

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(INVITE_ROLES),
});

export const createTeamUserSchema = z.object({
  fullName: z.string().trim().min(2, "Enter a full name"),
  email: emailSchema,
  role: z.enum(INVITE_ROLES),
});

export const resetTeamMemberPasswordSchema = z.object({
  memberId: z.string().uuid(),
});

export const updateMemberRoleSchema = z.object({
  memberId: z.string().uuid(),
  role: z.enum(["org_owner", "org_admin", "org_member", "org_viewer"]),
});

export const removeMemberSchema = z.object({
  memberId: z.string().uuid(),
});

export const switchOrgSchema = z.object({
  organizationId: z.string().uuid(),
});

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
