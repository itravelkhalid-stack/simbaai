import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureDefaultPipeline,
  logCrmActivity,
  upsertCrmContact,
} from "@/lib/crm/contacts";

function authOk(req: Request) {
  const secret = process.env.CRM_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header =
    req.headers.get("x-crm-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret;
}

const formSchema = z.object({
  organization_id: z.string().uuid(),
  brand_id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  form_name: z.string().default("website"),
  tags: z.array(z.string()).optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  if (!authOk(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = formSchema.parse(await req.json());
    await ensureDefaultPipeline(body.organization_id, body.brand_id);

    const contact = await upsertCrmContact({
      organizationId: body.organization_id,
      brandId: body.brand_id,
      email: body.email,
      name: body.name ?? null,
      phone: body.phone ?? null,
      company: body.company ?? null,
      source: "form",
      tags: ["form", ...(body.tags ?? [])],
      customFields: body.fields ?? {},
      lifecycleStage: "lead",
    });

    const supabase = createAdminClient();
    await supabase.from("crm_form_submissions").insert({
      organization_id: body.organization_id,
      brand_id: body.brand_id,
      contact_id: contact.id,
      form_name: body.form_name,
      payload: {
        email: body.email,
        name: body.name,
        phone: body.phone,
        company: body.company,
        ...(body.fields ?? {}),
      },
    });

    await logCrmActivity({
      organizationId: body.organization_id,
      contactId: contact.id,
      type: "note",
      content: `Form submission: ${body.form_name}`,
      meta: { form_name: body.form_name },
    });

    return NextResponse.json({ ok: true, contact_id: contact.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
