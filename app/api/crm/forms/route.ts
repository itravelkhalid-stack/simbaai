import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureDefaultPipeline,
  logCrmActivity,
  upsertCrmContact,
} from "@/lib/crm/contacts";
import { verifyCrmWebhook } from "@/lib/crm/webhook-auth";

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
  const rawBody = await req.text();
  let organizationId: string | undefined;
  try {
    organizationId = (JSON.parse(rawBody) as { organization_id?: string })
      .organization_id;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!organizationId) {
    return NextResponse.json(
      { error: "organization_id required" },
      { status: 400 },
    );
  }

  const auth = await verifyCrmWebhook({
    req,
    provider: "forms",
    organizationId,
    rawBody,
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const body = formSchema.parse(JSON.parse(rawBody));
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
