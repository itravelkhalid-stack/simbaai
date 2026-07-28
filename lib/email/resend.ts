import { Resend } from "resend";

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "Simba AI <onboarding@resend.dev>";
  return { apiKey, from };
}

export function getInvitationFromAddress() {
  return getResendConfig().from;
}

/**
 * Send a team invitation email via Resend.
 * Never silently skips — missing config or API errors throw so the UI can surface them.
 */
export async function sendInvitationEmail(params: {
  to: string;
  organizationName: string;
  inviteUrl: string;
  role: string;
}): Promise<{ id: string; from: string }> {
  const { apiKey, from } = getResendConfig();

  if (!apiKey) {
    console.error("[email] RESEND_API_KEY missing — cannot send invitation", {
      to: params.to,
      from,
    });
    throw new Error(
      "Email is not configured (RESEND_API_KEY missing). Invitation was saved but not emailed.",
    );
  }

  const resend = new Resend(apiKey);
  const payload = {
    from,
    to: params.to,
    subject: `You're invited to ${params.organizationName} on Simba AI`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.5;">
        <h2>Join ${params.organizationName}</h2>
        <p>You've been invited as <strong>${params.role.replace("org_", "")}</strong>.</p>
        <p><a href="${params.inviteUrl}">Accept invitation</a></p>
        <p>This link expires in 7 days.</p>
      </div>
    `,
  };

  const { data, error } = await resend.emails.send(payload);

  console.info("[email] invitation send result", {
    to: params.to,
    from,
    data,
    error,
  });

  if (error) {
    const detail =
      typeof error === "object" ? JSON.stringify(error) : String(error);
    console.error("[email] invitation send failed", detail);
    throw new Error(
      error.message || `Resend rejected the invitation email (${detail})`,
    );
  }

  const id = data?.id;
  if (!id) {
    console.error("[email] invitation send returned no id", { data, error });
    throw new Error(
      "Resend returned no message id — email may not have been queued.",
    );
  }

  return { id, from };
}
