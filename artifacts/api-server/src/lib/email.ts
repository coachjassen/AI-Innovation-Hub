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

export interface AgendaSummaryItem {
  position: number;
  title: string;
  durationMinutes: number | null;
  presenter: string | null;
  description: string | null;
}

/**
 * Build an .ics calendar event for a meeting. Returns the raw ICS string, or
 * null if the date could not be parsed (caller should skip the attachment).
 */
export async function buildMeetingIcs(opts: {
  meetingId: number;
  circleName: string;
  dateIso: string;
  agenda: AgendaSummaryItem[];
  /**
   * iCalendar METHOD (e.g. "REQUEST"). When set, the event is emitted as a
   * scheduling message so compliant calendars treat it as an invite/update
   * rather than a plain published event.
   */
  method?: string;
  /**
   * iCalendar SEQUENCE. Must strictly increase across updates to the same UID
   * so calendars supersede the existing event instead of ignoring the change.
   */
  sequence?: number;
}): Promise<string | null> {
  const start = new Date(opts.dateIso);
  if (isNaN(start.getTime())) return null;

  // Default to 60 minutes if no agenda durations are provided.
  const summed = opts.agenda.reduce((acc, a) => acc + (a.durationMinutes ?? 0), 0);
  const durationMinutes = summed > 0 ? summed : 60;

  const agendaLines = opts.agenda
    .map((a) => {
      const bits = [`${a.position}. ${a.title}`];
      if (a.durationMinutes) bits.push(`(${a.durationMinutes} min)`);
      if (a.presenter) bits.push(`— ${a.presenter}`);
      let line = bits.join(" ");
      if (a.description) line += `\n   ${a.description}`;
      return line;
    })
    .join("\n");

  const description = agendaLines
    ? `Agenda:\n${agendaLines}`
    : "Agenda to be confirmed.";

  const ics = await import("ics");
  return new Promise<string | null>((resolve) => {
    ics.createEvent(
      {
        uid: `meeting-${opts.meetingId}@ai-innovation-circle`,
        title: `${opts.circleName} Meeting`,
        start: [
          start.getUTCFullYear(),
          start.getUTCMonth() + 1,
          start.getUTCDate(),
          start.getUTCHours(),
          start.getUTCMinutes(),
        ],
        startInputType: "utc",
        duration: { minutes: durationMinutes },
        description,
        ...(opts.method ? { method: opts.method } : {}),
        ...(opts.sequence !== undefined ? { sequence: opts.sequence } : {}),
      },
      (err, value) => {
        if (err || !value) {
          logger.error({ err, meetingId: opts.meetingId }, "Failed to build ICS event");
          resolve(null);
          return;
        }
        resolve(value);
      },
    );
  });
}

export function buildRsvpConfirmationEmail(
  attendeeName: string,
  circleName: string,
  meetingDate: string,
  agenda: AgendaSummaryItem[],
): string {
  const agendaRows = agenda
    .map(
      (a) => `<tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${a.position}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${a.title}${a.description ? `<br/><span style="color:#6b7280;font-size:12px">${a.description}</span>` : ""}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${a.durationMinutes ? `${a.durationMinutes} min` : ""}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${a.presenter ?? ""}</td>
    </tr>`,
    )
    .join("");

  const agendaSection = agenda.length
    ? `<p>Here's what we'll cover:</p>
    <table style="border-collapse:collapse;width:100%">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="padding:8px;text-align:left">#</th>
          <th style="padding:8px;text-align:left">Topic</th>
          <th style="padding:8px;text-align:left">Time</th>
          <th style="padding:8px;text-align:left">Presenter</th>
        </tr>
      </thead>
      <tbody>${agendaRows}</tbody>
    </table>`
    : `<p>The agenda will be shared soon.</p>`;

  return `
    <p>Hi ${attendeeName},</p>
    <p>You're confirmed for the <strong>${circleName}</strong> meeting on <strong>${meetingDate}</strong>.</p>
    <p>We've attached a calendar invite so you can add it to your calendar.</p>
    ${agendaSection}
    <p>See you there!</p>
  `;
}

export function buildMeetingRescheduledEmail(
  attendeeName: string,
  circleName: string,
  meetingDate: string,
  agenda: AgendaSummaryItem[],
): string {
  const agendaRows = agenda
    .map(
      (a) => `<tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${a.position}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${a.title}${a.description ? `<br/><span style="color:#6b7280;font-size:12px">${a.description}</span>` : ""}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${a.durationMinutes ? `${a.durationMinutes} min` : ""}</td>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb">${a.presenter ?? ""}</td>
    </tr>`,
    )
    .join("");

  const agendaSection = agenda.length
    ? `<p>Here's what we'll cover:</p>
    <table style="border-collapse:collapse;width:100%">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="padding:8px;text-align:left">#</th>
          <th style="padding:8px;text-align:left">Topic</th>
          <th style="padding:8px;text-align:left">Time</th>
          <th style="padding:8px;text-align:left">Presenter</th>
        </tr>
      </thead>
      <tbody>${agendaRows}</tbody>
    </table>`
    : `<p>The agenda will be shared soon.</p>`;

  return `
    <p>Hi ${attendeeName},</p>
    <p>The <strong>${circleName}</strong> meeting has been <strong>rescheduled</strong>. It will now take place on <strong>${meetingDate}</strong>.</p>
    <p>We've attached an updated calendar invite — your existing calendar entry will be updated automatically.</p>
    ${agendaSection}
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
