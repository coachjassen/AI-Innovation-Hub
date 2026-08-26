import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import { db, attendeesTable, magicTokensTable } from "@workspace/db";

vi.mock("../lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/email")>();
  return { ...actual, sendEmail: vi.fn(async () => ({ sent: true as const })) };
});

import app from "../app";
import { sendEmail } from "../lib/email";

const sendEmailMock = sendEmail as unknown as Mock;
const ADMIN_EMAIL = "admin@demo.com";
const ATTENDEE_EMAIL = "marcus@techvision.com";
const CREATED_ADMIN_EMAIL = `new-admin-${process.pid}@example.test`;
const SMTP_UNAVAILABLE_EMAIL = `smtp-admin-${process.pid}@example.test`;
const ESCALATION_EMAIL = `attendee-role-${process.pid}@example.test`;

let server: Server;
let baseUrl: string;
let adminCookie: string;
let attendeeCookie: string;
const createdAttendeeIds: number[] = [];

interface ApiResult {
  status: number;
  body: any;
  setCookie: string | null;
}

async function api(
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = { "X-Forwarded-Proto": "https" };
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    setCookie: response.headers.get("set-cookie")?.split(";")[0] ?? null,
  };
}

function tokenFromLatestEmail(): string {
  const html = (sendEmailMock.mock.calls.at(-1)?.[0] as { html?: string } | undefined)?.html;
  const href = html?.match(/href="([^"]+)"/)?.[1];
  expect(href).toBeTruthy();
  const token = new URL(href as string).searchParams.get("token");
  expect(token).toBeTruthy();
  return token as string;
}

async function login(email: string): Promise<string> {
  sendEmailMock.mockClear();
  const request = await api("POST", "/api/auth/request-link", { body: { email } });
  expect(request.status).toBe(200);
  const token = tokenFromLatestEmail();
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

  const demo = await db
    .select({ id: attendeesTable.id })
    .from(attendeesTable)
    .where(inArray(attendeesTable.email, [ADMIN_EMAIL, ATTENDEE_EMAIL]));
  if (demo.length > 0) {
    await db.delete(magicTokensTable).where(inArray(magicTokensTable.attendeeId, demo.map(({ id }) => id)));
  }

  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  adminCookie = await login(ADMIN_EMAIL);
  attendeeCookie = await login(ATTENDEE_EMAIL);
});

afterAll(async () => {
  if (createdAttendeeIds.length > 0) {
    await db.delete(magicTokensTable).where(inArray(magicTokensTable.attendeeId, createdAttendeeIds));
    await db.delete(attendeesTable).where(inArray(attendeesTable.id, createdAttendeeIds));
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("administrator account management", () => {
  it("protects account listing and creation from anonymous and attendee users", async () => {
    const anonymous = await api("GET", "/api/admin/accounts");
    const attendeeRead = await api("GET", "/api/admin/accounts", { cookie: attendeeCookie });
    const attendeeCreate = await api("POST", "/api/admin/accounts", {
      cookie: attendeeCookie,
      body: { name: "Not Allowed", email: `not-allowed-${process.pid}@example.test`, circleId: 1 },
    });

    expect(anonymous.status).toBe(401);
    expect(attendeeRead.status).toBe(403);
    expect(attendeeCreate.status).toBe(403);
  });

  it("lists safe admin data and creates a normalized admin assigned to a valid Hub", async () => {
    const before = await api("GET", "/api/admin/accounts", { cookie: adminCookie });
    expect(before.status).toBe(200);
    expect(before.body.every((account: { role: string; token?: string }) => account.role === "admin" && !account.token)).toBe(true);

    sendEmailMock.mockClear();
    const created = await api("POST", "/api/admin/accounts", {
      cookie: adminCookie,
      body: {
        name: "New Hub Admin",
        email: `  ${CREATED_ADMIN_EMAIL.toUpperCase()}  `,
        company: "Example Company",
        circleId: 1,
      },
    });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: "New Hub Admin",
      email: CREATED_ADMIN_EMAIL,
      company: "Example Company",
      role: "admin",
      circleId: 1,
      onboardingEmailStatus: "sent",
    });
    createdAttendeeIds.push(created.body.id);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);

    const token = tokenFromLatestEmail();
    const verified = await api("POST", "/api/auth/verify", { body: { token } });
    expect(verified.status).toBe(200);
    expect(verified.body.role).toBe("admin");
    expect(verified.setCookie).toBeTruthy();

    const newAdminRead = await api("GET", "/api/admin/accounts", { cookie: verified.setCookie as string });
    expect(newAdminRead.status).toBe(200);
    expect(newAdminRead.body.some((account: { email: string }) => account.email === CREATED_ADMIN_EMAIL)).toBe(true);
  });

  it("rejects normalized duplicate emails and invalid Hub assignments", async () => {
    const duplicate = await api("POST", "/api/admin/accounts", {
      cookie: adminCookie,
      body: { name: "Duplicate", email: ` ${CREATED_ADMIN_EMAIL.toUpperCase()} `, circleId: 1 },
    });
    const invalidHub = await api("POST", "/api/admin/accounts", {
      cookie: adminCookie,
      body: { name: "Missing Hub", email: `missing-hub-${process.pid}@example.test`, circleId: 999999 },
    });
    const invalidInput = await api("POST", "/api/admin/accounts", {
      cookie: adminCookie,
      body: { name: "", email: "not-an-email", circleId: 1 },
    });

    expect(duplicate.status).toBe(409);
    expect(invalidHub.status).toBe(400);
    expect(invalidInput.status).toBe(400);
  });

  it("reports SMTP-unavailable onboarding without hiding the created account", async () => {
    const smtpHost = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    const created = await api("POST", "/api/admin/accounts", {
      cookie: adminCookie,
      body: { name: "SMTP Pending Admin", email: SMTP_UNAVAILABLE_EMAIL, circleId: 1 },
    });
    process.env.SMTP_HOST = smtpHost;

    expect(created.status).toBe(201);
    expect(created.body.email).toBe(SMTP_UNAVAILABLE_EMAIL);
    expect(created.body.role).toBe("admin");
    expect(created.body.onboardingEmailStatus).toBe("unavailable");
    createdAttendeeIds.push(created.body.id);
  });

  it("keeps attendee creation server-owned as an attendee role", async () => {
    const created = await api("POST", "/api/attendees", {
      cookie: adminCookie,
      body: {
        name: "Role Safety Check",
        email: ESCALATION_EMAIL,
        company: "Example Company",
        circleId: 1,
        role: "admin",
      },
    });

    expect(created.status).toBe(201);
    expect(created.body.role).toBe("attendee");
    createdAttendeeIds.push(created.body.id);
  });
});