/**
 * SMTP email utility using nodemailer.
 *
 * Required env vars (server-side only):
 *   SMTP_HOST     — e.g. smtp.resend.com
 *   SMTP_PORT     — e.g. 465
 *   SMTP_USER     — e.g. resend (or your email)
 *   SMTP_PASS     — SMTP password / API key
 *   SMTP_FROM     — e.g. "EduPulse <noreply@edupulse.in>"
 */
import nodemailer from "nodemailer";

function env(k: string) {
  return process.env[k]?.trim().replace(/^["']|["']$/g, "");
}

function getTransport() {
  const host = env("SMTP_HOST");
  const port = parseInt(env("SMTP_PORT") ?? "465", 10);
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");

  if (!host || !user || !pass) {
    throw new Error("SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in env.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
  });
}

const FROM = env("SMTP_FROM") ?? "EduPulse <noreply@edupulse.in>";

export async function sendConfirmationEmail(email: string, token: string, appUrl: string) {
  const transport = getTransport();
  const link = `${appUrl}/confirm?token=${token}`;
  await transport.sendMail({
    from: FROM,
    to: email,
    subject: "Confirm your EduPulse account",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#0f172a">Confirm your email</h2>
        <p>Thanks for signing up for EduPulse! Click the button below to confirm your account.</p>
        <a href="${link}" style="display:inline-block;background:#6366f1;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">Confirm email</a>
        <p style="color:#64748b;font-size:13px">Link expires in 24 hours. If you didn't sign up, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export async function sendOtpEmail(email: string, code: string) {
  const transport = getTransport();
  await transport.sendMail({
    from: FROM,
    to: email,
    subject: "Your EduPulse password reset code",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#0f172a">Password reset code</h2>
        <p>Use the code below to reset your EduPulse password. It expires in 15 minutes.</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#6366f1;padding:20px 0">${code}</div>
        <p style="color:#64748b;font-size:13px">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, token: string, appUrl: string) {
  const transport = getTransport();
  const link = `${appUrl}/reset-password?token=${token}`;
  await transport.sendMail({
    from: FROM,
    to: email,
    subject: "Reset your EduPulse password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#0f172a">Password reset</h2>
        <p>Click the button below to reset your EduPulse password. It expires in 1 hour.</p>
        <a href="${link}" style="display:inline-block;background:#6366f1;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">Reset password</a>
        <p style="color:#64748b;font-size:13px">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}

export async function sendStaffInviteEmail(email: string, inviteUrl: string, schoolName: string) {
  const transport = getTransport();
  await transport.sendMail({
    from: FROM,
    to: email,
    subject: `You've been invited to join ${schoolName} on EduPulse`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#0f172a">You're invited!</h2>
        <p>${schoolName} has invited you to join their team on EduPulse.</p>
        <p>Click the button below to set your password and activate your account.</p>
        <a href="${inviteUrl}" style="display:inline-block;background:#6366f1;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">Accept invitation</a>
        <p style="color:#64748b;font-size:13px">Link expires in 7 days. If you weren't expecting this, you can ignore this email.</p>
      </div>
    `,
  });
}

export async function sendParentInviteEmail(email: string, inviteUrl: string, schoolName: string, childName: string) {
  const transport = getTransport();
  await transport.sendMail({
    from: FROM,
    to: email,
    subject: `Your parent portal is ready — ${schoolName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#0f172a">Welcome to ${schoolName}'s parent portal!</h2>
        <p>Your child <strong>${childName}</strong> has been enrolled at ${schoolName}.</p>
        <p>Click the button below to set your password and access the parent portal — where you can view fees, attendance, activities and report cards.</p>
        <a href="${inviteUrl}" style="display:inline-block;background:#6366f1;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">Set up parent account</a>
        <p style="color:#64748b;font-size:13px">Link expires in 7 days. If you weren't expecting this, you can ignore this email.</p>
      </div>
    `,
  });
}

export async function sendInvoiceEmail(opts: {
  to: string;
  parentName: string;
  studentName: string;
  schoolName: string;
  amount: string;
  dueDate: string | null;
  invoiceId: number;
  payUrl: string;
}) {
  const transport = getTransport();
  const amountFmt = `₹${parseFloat(opts.amount).toLocaleString("en-IN")}`;
  const dueLine = opts.dueDate ? `<p style="color:#64748b;font-size:14px">Due date: <strong style="color:#0f172a">${opts.dueDate}</strong></p>` : "";
  await transport.sendMail({
    from: FROM,
    to: opts.to,
    subject: `Fee Invoice #${opts.invoiceId} — ${amountFmt} due | ${opts.schoolName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <div style="background:#6366f1;padding:24px 32px">
          <h1 style="color:#ffffff;margin:0;font-size:20px">${opts.schoolName}</h1>
          <p style="color:#c7d2fe;margin:4px 0 0;font-size:13px">Fee Invoice</p>
        </div>
        <div style="padding:28px 32px">
          <p style="color:#0f172a;font-size:15px">Dear ${opts.parentName},</p>
          <p style="color:#334155;font-size:14px">A fee invoice has been raised for <strong>${opts.studentName}</strong>.</p>
          <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:20px 0;border:1px solid #e2e8f0">
            <p style="margin:0 0 6px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Invoice #${opts.invoiceId}</p>
            <p style="margin:0;font-size:28px;font-weight:700;color:#6366f1">${amountFmt}</p>
            ${dueLine}
          </div>
          <p style="color:#334155;font-size:14px">You can pay online through the parent portal or pay in cash at the school reception.</p>
          <a href="${opts.payUrl}" style="display:inline-block;background:#6366f1;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin:8px 0 20px">View &amp; Pay Invoice</a>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px">
            This is an automated message from EduPulse. Please do not reply to this email.
          </p>
        </div>
      </div>
    `,
  });
}
