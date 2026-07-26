import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail =
  process.env.RESEND_FROM_EMAIL ?? "Simba AI <onboarding@resend.dev>";

export async function sendInvitationEmail(params: {
  to: string;
  organizationName: string;
  inviteUrl: string;
  role: string;
}) {
  if (!resendApiKey) {
    console.warn(
      "[email] RESEND_API_KEY missing — invitation email not sent:",
      params.inviteUrl,
    );
    return { skipped: true as const };
  }

  const resend = new Resend(resendApiKey);
  const { error } = await resend.emails.send({
    from: fromEmail,
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
  });

  if (error) {
    throw new Error(error.message);
  }

  return { skipped: false as const };
}
