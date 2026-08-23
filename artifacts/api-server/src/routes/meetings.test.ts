import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

// Spy on the outbound mailer while keeping the real .ics / HTML builders so the
// confirmation path actually executes. sendEmail itself no-ops in POC mode (no
// SMTP env), exactly the environment we want to prove never throws.
vi.mock("../lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/email")>();
  return { ...actual, sendEmail: vi.fn(async () => {}) };
});

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
  const res = await api("POST", "/api/auth/request-link", { body: { email } });
  expect(res.status, `login for ${email} should succeed`).toBe(200);
  expect(res.setCookie, `login for ${email} should set a session cookie`).toBeTruthy();
  return res.setCookie as string;
}

beforeAll(async () => {
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
});

afterAll(async () => {
  // Cascades remove agenda items, invitees, and responses created during the test.
  if (meetingId) {
    await api("DELETE", `/api/meetings/${meetingId}`, { cookie: adminCookie });
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
