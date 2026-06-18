import { logger } from "./logger";

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

/**
 * Single email-sending function. Swap the implementation here to change provider.
 * Currently logs email content when SMTP is not configured (POC mode).
 */
export async function sendEmail(opts: EmailOptions): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    logger.warn(
      { to: opts.to, subject: opts.subject },
      "SMTP not configured — email suppressed (POC mode)",
    );
    return;
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT ?? "587", 10),
      secure: parseInt(SMTP_PORT ?? "587", 10) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_FROM,
      to: Array.isArray(opts.to) ? opts.to.join(", ") : opts.to,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments,
    });

    logger.info({ to: opts.to, subject: opts.subject }, "Email sent");
  } catch (err) {
    logger.error({ err, to: opts.to, subject: opts.subject }, "Failed to send email");
    throw err;
  }
}

export function buildMagicLinkEmail(link: string, name: string): string {
  return `
    <p>Hi ${name},</p>
    <p>Click the link below to sign in to AI Innovation Circle. This link expires in 1 hour.</p>
    <p><a href="${link}" style="background:#1a56db;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Sign in</a></p>
    <p>If you did not request this, you can safely ignore this email.</p>
  `;
}

export function buildReminderEmail(
  attendeeName: string,
  circleName: string,
  meetingDate: string,
  openGoals: Array<{ timeframe: string; status: string; comments: string | null }>,
): string {
  const goalRows = openGoals
    .map(
      (g) => `<tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${g.timeframe}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${g.status}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${g.comments ?? ""}</td>
    </tr>`,
    )
    .join("");

  return `
    <p>Hi ${attendeeName},</p>
    <p>Your upcoming <strong>${circleName}</strong> meeting is on <strong>${meetingDate}</strong>.</p>
    <p>Here are your open goals to review:</p>
    <table style="border-collapse:collapse;width:100%">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="padding:8px;text-align:left">Timeframe</th>
          <th style="padding:8px;text-align:left">Status</th>
          <th style="padding:8px;text-align:left">Comments</th>
        </tr>
      </thead>
      <tbody>${goalRows}</tbody>
    </table>
    <p>See you there!</p>
  `;
}

export function buildSurveyEmail(
  attendeeName: string,
  circleName: string,
  surveyLink: string,
  questions: string[],
): string {
  const qList = questions.map((q, i) => `<li>${i + 1}. ${q}</li>`).join("");
  return `
    <p>Hi ${attendeeName},</p>
    <p>Thank you for attending the <strong>${circleName}</strong> meeting. Please take a moment to share your feedback.</p>
    <ul>${qList}</ul>
    <p><a href="${surveyLink}" style="background:#1a56db;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Complete Survey</a></p>
  `;
}
