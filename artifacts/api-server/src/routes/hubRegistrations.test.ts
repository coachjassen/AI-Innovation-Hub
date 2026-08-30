import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import {
  attendeesTable,
  circlesTable,
  db,
  hubRegistrationsTable,
  magicTokensTable,
  meetingInviteesTable,
  meetingsTable,
} from "@workspace/db";

vi.mock("../lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/email")>();
  return { ...actual, sendEmail: vi.fn(async () => ({ sent: true as const })) };
});

import app from "../app";
import { sendEmail } from "../lib/email";

const sendEmailMock = sendEmail as unknown as Mock;
const ADMIN_EMAIL = "admin@demo.com";
const REGISTRATION_EMAIL = `hub-interest-${process.pid}@example.test`;

let server: Server;
let baseUrl: string;
let origin: string;
let adminCookie: string;
let circleId: number;
let meetingId: number | null = null;

interface ApiResult {
  status: number;
  body: any;
  setCookie: string | null;
}

async function api(
  method: string,
  path: string,
  options: { cookie?: string; body?: unknown } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = {
    "X-Forwarded-Proto": "https",
    Origin: origin,
  };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const setCookieHeader = response.headers.get("set-cookie");
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    setCookie: setCookieHeader ? setCookieHeader.split(";")[0] : null,
  };
}

async function loginAdmin(): Promise<string> {
  const requested = await api("POST", "/api/auth/request-link", { body: { email: ADMIN_EMAIL } });
  expect(requested.status).toBe(200);
  const emailHtml = (sendEmailMock.mock.calls.at(-1)?.[0] as { html?: string } | undefined)?.html;
  const link = emailHtml?.match(/href="([^"]+)"/)?.[1];
  expect(link).toBeTruthy();
  const token = new URL(link as string).searchParams.get("token");
  const verified = await api("POST", "/api/auth/verify", { body: { token } });
  expect(verified.status).toBe(200);
  expect(verified.setCookie).toBeTruthy();
  return verified.setCookie as string;
}

beforeAll(async () => {
  process.env.SMTP_HOST = "smtp.test";
  process.env.SMTP_USER = "test-user";
  process.env.SMTP_PASS = "test-password";
  process.env.SMTP_FROM = "hubs@example.test";
  process.env.APP_URL = "https://hubs.example.test";

  const admins = await db
    .select({ id: attendeesTable.id })
    .from(attendeesTable)
    .where(eq(attendeesTable.email, ADMIN_EMAIL));
  if (admins.length > 0) {
    await db
      .delete(magicTokensTable)
      .where(inArray(magicTokensTable.attendeeId, admins.map((admin) => admin.id)));
  }
  await db.delete(attendeesTable).where(eq(attendeesTable.email, REGISTRATION_EMAIL));

  const [circle] = await db
    .insert(circlesTable)
    .values({
      name: `Public registration test ${process.pid}`,
      cadence: "quarterly",
      status: "active",
      registrationDescription: "A practical peer forum for innovation leaders.",
      registrationOpen: true,
    })
    .returning({ id: circlesTable.id });
  circleId = circle.id;

  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  origin = `https://127.0.0.1:${port}`;
  adminCookie = await loginAdmin();
});

afterAll(async () => {
  if (meetingId) {
    await db.delete(meetingsTable).where(eq(meetingsTable.id, meetingId));
  }
  await db.delete(attendeesTable).where(eq(attendeesTable.email, REGISTRATION_EMAIL));
  await db.delete(circlesTable).where(eq(circlesTable.id, circleId));
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("Hub interest registration", () => {
  it("publishes a revocable link, accepts an idempotent public registration, and promotes it on meeting creation", async () => {
    const createdLink = await api("POST", `/api/circles/${circleId}/registration-link`, {
      cookie: adminCookie,
    });
    expect(createdLink.status).toBe(200);
    const publicUrl = new URL(createdLink.body.url);
    const token = publicUrl.pathname.split("/").at(-1);
    expect(token).toHaveLength(64);

    const details = await api("GET", `/api/registration/${token}`);
    expect(details.status).toBe(200);
    expect(details.body).toMatchObject({
      cadence: "quarterly",
      registrationOpen: true,
      description: "A practical peer forum for innovation leaders.",
    });

    const submission = {
      name: "Taylor Prospect",
      email: REGISTRATION_EMAIL.toUpperCase(),
      company: "Prospect Co",
    };
    const firstRegistration = await api("POST", `/api/registration/${token}`, { body: submission });
    const duplicateRegistration = await api("POST", `/api/registration/${token}`, { body: submission });
    expect(firstRegistration.status).toBe(200);
    expect(duplicateRegistration.status).toBe(200);

    const beforePromotion = await api("GET", `/api/circles/${circleId}/registrations`, {
      cookie: adminCookie,
    });
    expect(beforePromotion.status).toBe(200);
    expect(beforePromotion.body).toHaveLength(1);
    expect(beforePromotion.body[0]).toMatchObject({
      email: REGISTRATION_EMAIL,
      attendeeId: null,
      promotedAt: null,
    });

    sendEmailMock.mockClear();
    const createdMeeting = await api("POST", "/api/meetings", {
      cookie: adminCookie,
      body: { circleId, date: "2032-05-20T09:00:00.000Z" },
    });
    expect(createdMeeting.status).toBe(201);
    meetingId = createdMeeting.body.id;
    const createdMeetingId = meetingId;
    expect(createdMeetingId).toBeTypeOf("number");
    if (createdMeetingId === null) throw new Error("Meeting id was not returned");
    expect(sendEmailMock).not.toHaveBeenCalled();

    const [attendee] = await db
      .select()
      .from(attendeesTable)
      .where(and(
        eq(attendeesTable.circleId, circleId),
        eq(attendeesTable.email, REGISTRATION_EMAIL),
      ));
    expect(attendee).toMatchObject({
      name: "Taylor Prospect",
      company: "Prospect Co",
      role: "attendee",
    });

    const [registration] = await db
      .select()
      .from(hubRegistrationsTable)
      .where(eq(hubRegistrationsTable.circleId, circleId));
    expect(registration.attendeeId).toBe(attendee.id);
    expect(registration.promotedAt).toBeInstanceOf(Date);

    const invitees = await db
      .select()
      .from(meetingInviteesTable)
      .where(eq(meetingInviteesTable.meetingId, createdMeetingId));
    expect(invitees).toHaveLength(0);
  });

  it("revokes the previous token when a replacement link is generated", async () => {
    const first = await api("POST", `/api/circles/${circleId}/registration-link`, {
      cookie: adminCookie,
    });
    const firstToken = new URL(first.body.url).pathname.split("/").at(-1);
    const second = await api("POST", `/api/circles/${circleId}/registration-link`, {
      cookie: adminCookie,
    });
    const secondToken = new URL(second.body.url).pathname.split("/").at(-1);

    expect(firstToken).not.toBe(secondToken);
    expect((await api("GET", `/api/registration/${firstToken}`)).status).toBe(404);
    expect((await api("GET", `/api/registration/${secondToken}`)).status).toBe(200);
  });
});