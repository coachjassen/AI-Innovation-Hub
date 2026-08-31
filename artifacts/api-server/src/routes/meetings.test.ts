import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  attendeesTable,
  circlesTable,
  magicTokensTable,
  meetingInviteesTable,
  meetingsTable,
} from "@workspace/db";

// Spy on the outbound mailer while keeping the real .ics / HTML builders so the
// confirmation path actually executes. sendEmail itself no-ops in POC mode (no
// SMTP env), exactly the environment we want to prove never throws.
vi.mock("../lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/email")>();
  return { ...actual, sendEmail: vi.fn(async () => ({ sent: true as const })) };
});

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    async getObjectEntityFile() {
      return { download: async () => [Buffer.from("sample invitation file")] };
    }
  },
  ObjectNotFoundError: class ObjectNotFoundError extends Error {},
}));

import app from "../app";
import { sendEmail } from "../lib/email";

const sendEmailMock = sendEmail as unknown as Mock;

const ADMIN_EMAIL = "admin@demo.com";
const ATTENDEE_EMAIL = "marcus@techvision.com";

let server: Server;
let baseUrl: string;
let adminCookie: string;
let attendeeCookie: string;
let meetingId: number;
let attendeeId: number;
let adminId: number;
let oneOffCircleId: number;
let oneOffMeetingId: number;
let oneOffAttendeeId: number;
const ONE_OFF_TOKEN = "a".repeat(64);
const CIRCLE_ID = 1; // both demo admin and attendees live in circle 1

interface ApiResult {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  setCookie: string | null;
}

// Drive the app the way the Replit proxy does: HTTPS-terminated upstream. The
// session cookie is Secure, so express-session only emits it when it believes
// the request arrived over TLS; X-Forwarded-Proto + `trust proxy` makes that
// true. We track the cookie by hand so the Secure attribute never blocks replay
// over the in-process HTTP listener.
async function api(
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = { "X-Forwarded-Proto": "https" };
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const setCookieHeader = res.headers.get("set-cookie");
  const setCookie = setCookieHeader ? setCookieHeader.split(";")[0] : null;

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { status: res.status, body, setCookie };
}

async function login(email: string): Promise<string> {
  sendEmailMock.mockClear();
  const requested = await api("POST", "/api/auth/request-link", { body: { email } });
  expect(requested.status, `sign-in link for ${email} should be requested`).toBe(200);
  expect(requested.setCookie, "requesting a sign-in link must not create a session").toBeNull();

  const emailHtml = (sendEmailMock.mock.calls.at(-1)?.[0] as { html?: string } | undefined)?.html;
  const href = emailHtml?.match(/href="([^"]+)"/)?.[1];
  expect(href, "a sign-in email should contain a link").toBeTruthy();
  const token = new URL(href as string).searchParams.get("token");
  expect(token).toBeTruthy();

  const verified = await api("POST", "/api/auth/verify", { body: { token } });
  expect(verified.status, `sign-in link for ${email} should verify`).toBe(200);
  expect(verified.setCookie, `verified sign-in for ${email} should set a session cookie`).toBeTruthy();
  return verified.setCookie as string;
}

beforeAll(async () => {
  process.env.SMTP_HOST = "smtp.test";
  process.env.SMTP_USER = "test-user";
  process.env.SMTP_PASS = "test-password";
  process.env.SMTP_FROM = "hubs@example.test";
  process.env.APP_URL = "https://hubs.example.test";
  const demoAttendees = await db
    .select({ id: attendeesTable.id })
    .from(attendeesTable)
    .where(inArray(attendeesTable.email, [ADMIN_EMAIL, ATTENDEE_EMAIL]));
  if (demoAttendees.length > 0) {
    await db.delete(magicTokensTable).where(inArray(magicTokensTable.attendeeId, demoAttendees.map((attendee) => attendee.id)));
  }
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  adminCookie = await login(ADMIN_EMAIL);
  attendeeCookie = await login(ATTENDEE_EMAIL);

  const attendees = await api("GET", `/api/attendees?circleId=${CIRCLE_ID}`, { cookie: adminCookie });
  expect(attendees.status).toBe(200);
  attendeeId = attendees.body.find((attendee: { email: string }) => attendee.email === ATTENDEE_EMAIL)?.id;
  adminId = attendees.body.find((attendee: { email: string; role: string }) =>
    attendee.email === ADMIN_EMAIL && attendee.role === "admin",
  )?.id;
  expect(attendeeId).toBeTruthy();
  expect(adminId).toBeTruthy();

  const created = await api("POST", "/api/meetings", {
    cookie: adminCookie,
    body: { circleId: CIRCLE_ID, date: "2030-01-15T17:00:00.000Z", notes: "rsvp/agenda test" },
  });
  expect(created.status).toBe(201);
  meetingId = created.body.id;

  const [oneOffCircle] = await db
    .insert(circlesTable)
    .values({ name: `One-off invitation test ${Date.now()}`, cadence: "one-off", status: "active" })
    .returning({ id: circlesTable.id });
  oneOffCircleId = oneOffCircle.id;
  const [oneOffAttendee] = await db
    .insert(attendeesTable)
    .values({
      name: "One-off invitation recipient",
      email: `one-off-recipient-${Date.now()}@example.test`,
      company: "Test company",
      role: "attendee",
      circleId: oneOffCircleId,
    })
    .returning({ id: attendeesTable.id });
  oneOffAttendeeId = oneOffAttendee.id;

  const oneOffCreated = await api("POST", "/api/meetings", {
    cookie: adminCookie,
    body: { circleId: oneOffCircleId, date: "2030-02-15T17:00:00.000Z" },
  });
  expect(oneOffCreated.status).toBe(201);
  oneOffMeetingId = oneOffCreated.body.id;
});

afterAll(async () => {
  // Cascades remove agenda items, invitees, and responses created during the test.
  if (meetingId) {
    await api("DELETE", `/api/meetings/${meetingId}`, { cookie: adminCookie });
  }
  if (oneOffMeetingId) {
    await db.delete(meetingsTable).where(eq(meetingsTable.id, oneOffMeetingId));
  }
  if (oneOffAttendeeId) {
    await db.delete(attendeesTable).where(eq(attendeesTable.id, oneOffAttendeeId));
  }
  if (oneOffCircleId) {
    await db.delete(circlesTable).where(eq(circlesTable.id, oneOffCircleId));
  }
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe("meeting invitee selection", () => {
  it("starts a new meeting with no invitees, hides it from attendees, and forbids an RSVP", async () => {
    const invitees = await api("GET", `/api/meetings/${meetingId}/invitees`, { cookie: adminCookie });
    expect(invitees.status).toBe(200);
    expect(invitees.body.find((invitee: { attendeeId: number }) => invitee.attendeeId === attendeeId)?.invited).toBe(false);

    const attendeeMeetings = await api("GET", "/api/meetings", { cookie: attendeeCookie });
    expect(attendeeMeetings.status).toBe(200);
    expect(attendeeMeetings.body.some((meeting: { id: number }) => meeting.id === meetingId)).toBe(false);

    const rsvp = await api("PUT", `/api/meetings/${meetingId}/response`, {
      cookie: attendeeCookie,
      body: { status: "attending" },
    });
    expect(rsvp.status).toBe(403);
  });

  it("lets an admin select valid attendees, rejects ineligible selections, and exposes only the selected roster", async () => {
    const nonAdminRead = await api("GET", `/api/meetings/${meetingId}/invitees`, { cookie: attendeeCookie });
    expect(nonAdminRead.status).toBe(403);

    const invalidSelection = await api("PUT", `/api/meetings/${meetingId}/invitees`, {
      cookie: adminCookie,
      body: { attendeeIds: [adminId] },
    });
    expect(invalidSelection.status).toBe(400);

    sendEmailMock.mockClear();
    const saved = await api("PUT", `/api/meetings/${meetingId}/invitees`, {
      cookie: adminCookie,
      body: { attendeeIds: [attendeeId] },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.find((invitee: { attendeeId: number }) => invitee.attendeeId === attendeeId)?.invited).toBe(true);

    const roster = await api("GET", `/api/meetings/${meetingId}/responses`, { cookie: adminCookie });
    expect(roster.status).toBe(200);
    expect(roster.body).toHaveLength(1);
    expect(roster.body[0]).toMatchObject({ attendeeId, status: "no_response" });

    const attendeeMeetings = await api("GET", "/api/meetings", { cookie: attendeeCookie });
    expect(attendeeMeetings.status).toBe(200);
    expect(attendeeMeetings.body.find((meeting: { id: number }) => meeting.id === meetingId)).toMatchObject({
      totalInvited: 1,
    });

    await vi.waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1), { timeout: 5000 });
    const [invitationEmail] = sendEmailMock.mock.calls[0] as [{
      html: string;
      attachments?: Array<{ filename: string; content: string }>;
    }];
    const rsvpToken = invitationEmail.html.match(/meeting-rsvp\/([a-f0-9]{64})/i)?.[1];
    expect(rsvpToken).toBeTruthy();
    expect(invitationEmail.html).toContain("RSVP to this meeting");
    expect(invitationEmail.attachments?.[0]?.filename).toBe("meeting.ics");
    expect(invitationEmail.attachments?.[0]?.content).toContain("BEGIN:VCALENDAR");

    const publicRsvp = await api("GET", `/api/meeting-rsvp/${rsvpToken}`);
    expect(publicRsvp.status).toBe(200);
    expect(publicRsvp.body).toMatchObject({
      meetingId,
      attendeeName: expect.any(String),
      status: "no_response",
    });

    const submittedRsvp = await api("PUT", `/api/meeting-rsvp/${rsvpToken}`, {
      body: { status: "attending" },
    });
    expect(submittedRsvp.status).toBe(200);
    expect(submittedRsvp.body.status).toBe("attending");

    const updatedRoster = await api("GET", `/api/meetings/${meetingId}/responses`, { cookie: adminCookie });
    expect(updatedRoster.status).toBe(200);
    expect(updatedRoster.body[0]).toMatchObject({ attendeeId, status: "attending" });

    const invalidPublicRsvp = await api("GET", `/api/meeting-rsvp/${"c".repeat(64)}`);
    expect(invalidPublicRsvp.status).toBe(404);
  });
});

describe("agenda authorization", () => {
  const agenda = {
    items: [
      { title: "Welcome & intros", durationMinutes: 10, presenter: "Sarah" },
      { title: "AI roadmap review", durationMinutes: 25, presenter: "Marcus" },
      { title: "Open discussion", durationMinutes: 15 },
    ],
  };

  it("lets an admin replace the full ordered agenda", async () => {
    const res = await api("PUT", `/api/meetings/${meetingId}/agenda`, {
      cookie: adminCookie,
      body: agenda,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body.map((i: { position: number }) => i.position)).toEqual([1, 2, 3]);
    expect(res.body.map((i: { title: string }) => i.title)).toEqual([
      "Welcome & intros",
      "AI roadmap review",
      "Open discussion",
    ]);
  });

  it("persists and returns the agenda in order on read", async () => {
    const res = await api("GET", `/api/meetings/${meetingId}/agenda`, { cookie: adminCookie });
    expect(res.status).toBe(200);
    expect(res.body.map((i: { title: string }) => i.title)).toEqual([
      "Welcome & intros",
      "AI roadmap review",
      "Open discussion",
    ]);
  });

  it("lets an attendee READ the agenda", async () => {
    const res = await api("GET", `/api/meetings/${meetingId}/agenda`, { cookie: attendeeCookie });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  it("forbids an attendee from WRITING the agenda (403)", async () => {
    const res = await api("PUT", `/api/meetings/${meetingId}/agenda`, {
      cookie: attendeeCookie,
      body: { items: [{ title: "sneaky edit" }] },
    });
    expect(res.status).toBe(403);

    // Confirm the attempt did not mutate the agenda.
    const after = await api("GET", `/api/meetings/${meetingId}/agenda`, { cookie: adminCookie });
    expect(after.body).toHaveLength(3);
  });
});

describe("RSVP confirmation flow", () => {
  it("persists 'attending' and runs the confirmation/.ics path without throwing (no SMTP)", async () => {
    sendEmailMock.mockClear();

    const res = await api("PUT", `/api/meetings/${meetingId}/response`, {
      cookie: attendeeCookie,
      body: { status: "attending" },
    });
    expect(res.status).toBe(200);
    expect(res.body.myResponse).toBe("attending");
    expect(res.body.attendingCount).toBeGreaterThanOrEqual(1);

    // The mailer is invoked fire-and-forget after the response is sent. Wait for
    // it; reaching this point proves the .ics build + email assembly never threw.
    await vi.waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1), { timeout: 5000 });

    const [emailArg] = sendEmailMock.mock.calls[0];
    expect(emailArg.to).toBe(ATTENDEE_EMAIL);
    expect(emailArg.subject).toContain("confirmed");
    const ics = emailArg.attachments?.[0];
    expect(ics?.filename).toBe("meeting.ics");
    expect(ics?.content).toContain("BEGIN:VCALENDAR");
  });

  it("sends nothing when switching to 'not_attending'", async () => {
    sendEmailMock.mockClear();

    const res = await api("PUT", `/api/meetings/${meetingId}/response`, {
      cookie: attendeeCookie,
      body: { status: "not_attending" },
    });
    expect(res.status).toBe(200);
    expect(res.body.myResponse).toBe("not_attending");

    // Give any (incorrect) fire-and-forget send a chance to land, then confirm
    // none happened.
    await new Promise((r) => setTimeout(r, 500));
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("one-off invitation RSVP flow", () => {
  it("does not create an inherited agenda and rejects agenda writes", async () => {
    const agenda = await api("GET", `/api/meetings/${oneOffMeetingId}/agenda`, { cookie: adminCookie });
    expect(agenda.status).toBe(400);

    const writeAgenda = await api("PUT", `/api/meetings/${oneOffMeetingId}/agenda`, {
      cookie: adminCookie,
      body: { items: [{ title: "Should not be saved" }] },
    });
    expect(writeAgenda.status).toBe(400);
  });

  it("preserves invitation contact state while the invitee selection is saved again", async () => {
    const selected = await api("PUT", `/api/meetings/${oneOffMeetingId}/invitees`, {
      cookie: adminCookie,
      body: { attendeeIds: [oneOffAttendeeId] },
    });
    expect(selected.status).toBe(200);

    await db
      .update(meetingInviteesTable)
      .set({
        invitationTokenHash: createHash("sha256").update(ONE_OFF_TOKEN).digest("hex"),
        invitationSentAt: new Date(),
        invitationSendCount: 1,
      })
      .where(and(eq(meetingInviteesTable.meetingId, oneOffMeetingId), eq(meetingInviteesTable.attendeeId, oneOffAttendeeId)));

    const resaved = await api("PUT", `/api/meetings/${oneOffMeetingId}/invitees`, {
      cookie: adminCookie,
      body: { attendeeIds: [oneOffAttendeeId] },
    });
    expect(resaved.status).toBe(200);
    const invitee = resaved.body.find((row: { attendeeId: number }) => row.attendeeId === oneOffAttendeeId);
    expect(invitee).toMatchObject({ invitationSendCount: 1 });
    expect(invitee.invitationSentAt).toBeTruthy();
  });

  it("lets an invitee RSVP with the bearer token without a login session", async () => {
    const before = await api("GET", `/api/one-off-rsvp/${ONE_OFF_TOKEN}`);
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ meetingId: oneOffMeetingId, status: "no_response" });

    const response = await api("PUT", `/api/one-off-rsvp/${ONE_OFF_TOKEN}`, {
      body: { status: "attending" },
    });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("attending");

    const invalid = await api("GET", `/api/one-off-rsvp/${"b".repeat(64)}`);
    expect(invalid.status).toBe(404);
  });

  it("requires an uploaded attachment before sending first-time invitations", async () => {
    const send = await api("POST", `/api/meetings/${oneOffMeetingId}/one-off-invitations/send`, {
      cookie: adminCookie,
    });
    expect(send.status).toBe(400);
    expect(send.body.error).toContain("Upload an invitation file");
  });

  it("sends the custom event email with both attachments and a fresh bearer RSVP link", async () => {
    const configured = await api("PATCH", `/api/meetings/${oneOffMeetingId}`, {
      cookie: adminCookie,
      body: {
        keyInsight: "A focused event",
        notes: "Bring your questions and ideas.",
        invitationBody: "A tailored invitation message.",
        invitationAttachmentPath: "/objects/invitations/sample.pdf",
        invitationAttachmentName: "event-invitation.pdf",
        invitationAttachmentContentType: "application/pdf",
      },
    });
    expect(configured.status).toBe(200);
    await db
      .update(meetingInviteesTable)
      .set({ invitationTokenHash: null, invitationSentAt: null })
      .where(and(eq(meetingInviteesTable.meetingId, oneOffMeetingId), eq(meetingInviteesTable.attendeeId, oneOffAttendeeId)));

    sendEmailMock.mockClear();
    const sent = await api("POST", `/api/meetings/${oneOffMeetingId}/one-off-invitations/send`, {
      cookie: adminCookie,
    });
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ sentCount: 1, failures: [] });

    const [email] = sendEmailMock.mock.calls[0] as [{
      html: string;
      attachments: Array<{ filename: string; content: string }>;
    }];
    expect(email.html).toContain("A focused event");
    expect(email.html).toContain("Bring your questions and ideas.");
    expect(email.html).toContain("A tailored invitation message.");
    expect(email.attachments.map((attachment) => attachment.filename)).toEqual(["event-invitation.pdf", "event.ics"]);
    expect(email.attachments[1].content).toContain("BEGIN:VCALENDAR");

    const token = email.html.match(/one-off-rsvp\/([a-f0-9]{64})/i)?.[1];
    expect(token).toBeTruthy();
    const publicInvitation = await api("GET", `/api/one-off-rsvp/${token}`);
    expect(publicInvitation.status).toBe(200);
  });
});
