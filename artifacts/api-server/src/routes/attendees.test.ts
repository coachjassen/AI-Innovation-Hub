import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import { db, attendeesTable, circlesTable, magicTokensTable } from "@workspace/db";

vi.mock("../lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/email")>();
  return { ...actual, sendEmail: vi.fn(async () => ({ sent: true as const })) };
});

import app from "../app";
import { sendEmail } from "../lib/email";

const sendEmailMock = sendEmail as unknown as Mock;

const ADMIN_EMAIL = "admin@demo.com";
const ATTENDEE_EMAIL = "marcus@techvision.com";
const TEST_EMAILS = [
  `csv-import-test-${process.pid}-a@example.com`,
  `csv-import-test-${process.pid}-b@example.com`,
  `csv-import-test-${process.pid}-c@example.com`,
];
const CROSS_HUB_EMAIL = `cross-hub-test-${process.pid}@example.com`;

let server: Server;
let baseUrl: string;
let adminCookie: string;
let attendeeCookie: string;
let inactiveCircleId: number;
let crossHubCircleId: number;
let testOrigin: string;

interface ApiResult {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  setCookie: string | null;
}

async function api(
  method: string,
  path: string,
  opts: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = {
    "X-Forwarded-Proto": "https",
    Origin: testOrigin,
    ...opts.headers,
  };
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const setCookieHeader = response.headers.get("set-cookie");
  const setCookie = setCookieHeader ? setCookieHeader.split(";")[0] : null;
  const text = await response.text();

  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body, setCookie };
}

async function login(email: string): Promise<string> {
  sendEmailMock.mockClear();
  const requested = await api("POST", "/api/auth/request-link", { body: { email } });
  expect(requested.status).toBe(200);
  expect(requested.setCookie).toBeNull();
  const emailHtml = (sendEmailMock.mock.calls.at(-1)?.[0] as { html?: string } | undefined)?.html;
  const href = emailHtml?.match(/href="([^"]+)"/)?.[1];
  expect(href).toBeTruthy();
  const token = new URL(href as string).searchParams.get("token");
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
  const demoAttendees = await db
    .select({ id: attendeesTable.id })
    .from(attendeesTable)
    .where(inArray(attendeesTable.email, [ADMIN_EMAIL, ATTENDEE_EMAIL]));
  if (demoAttendees.length > 0) {
    await db.delete(magicTokensTable).where(inArray(magicTokensTable.attendeeId, demoAttendees.map((attendee) => attendee.id)));
  }
  await db.delete(attendeesTable).where(inArray(attendeesTable.email, TEST_EMAILS));
  const [inactiveCircle] = await db
    .insert(circlesTable)
    .values({
      name: `CSV Import Inactive Test ${process.pid}`,
      cadence: "monthly",
      status: "inactive",
    })
    .returning({ id: circlesTable.id });
  inactiveCircleId = inactiveCircle.id;
  const [crossHubCircle] = await db
    .insert(circlesTable)
    .values({
      name: `Cross Hub Test ${process.pid}`,
      cadence: "monthly",
      status: "active",
    })
    .returning({ id: circlesTable.id });
  crossHubCircleId = crossHubCircle.id;
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  testOrigin = baseUrl.replace("http://", "https://");
  adminCookie = await login(ADMIN_EMAIL);
  attendeeCookie = await login(ATTENDEE_EMAIL);
});

afterAll(async () => {
  await db.delete(attendeesTable).where(inArray(attendeesTable.email, TEST_EMAILS));
  await db.delete(attendeesTable).where(eq(attendeesTable.email, CROSS_HUB_EMAIL));
  await db.delete(circlesTable).where(inArray(circlesTable.id, [inactiveCircleId, crossHubCircleId]));
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("attendee CSV import", () => {
  it("requires admin access", async () => {
    const response = await api("POST", "/api/attendees/import", {
      cookie: attendeeCookie,
      body: {
        circleId: 1,
        attendees: [{ name: "Not Allowed", email: TEST_EMAILS[0] }],
      },
    });
    expect(response.status).toBe(403);
  });

  it("rejects cross-origin state-changing requests", async () => {
    const response = await api("POST", "/api/attendees/import", {
      cookie: adminCookie,
      headers: { Origin: "https://malicious.example" },
      body: {
        circleId: 1,
        attendees: [{ name: "Cross Origin", email: TEST_EMAILS[0] }],
      },
    });
    expect(response.status).toBe(403);

    const differentPortOrigin = new URL(testOrigin);
    differentPortOrigin.port = String(Number(differentPortOrigin.port) + 1);
    const sameHostDifferentPort = await api("POST", "/api/attendees/import", {
      cookie: adminCookie,
      headers: { Origin: differentPortOrigin.origin },
      body: {
        circleId: 1,
        attendees: [{ name: "Wrong Port", email: TEST_EMAILS[0] }],
      },
    });
    expect(sameHostDifferentPort.status).toBe(403);

    const sameOrigin = await api("POST", "/api/attendees/import", {
      cookie: adminCookie,
      body: {
        circleId: 999999,
        attendees: [{ name: "Same Origin", email: TEST_EMAILS[0] }],
      },
    });
    expect(sameOrigin.status).toBe(400);
  });

  it("rejects invalid Hub and malformed rows before creating anything", async () => {
    const invalidHub = await api("POST", "/api/attendees/import", {
      cookie: adminCookie,
      body: {
        circleId: 999999,
        attendees: [{ name: "Invalid Hub", email: TEST_EMAILS[0] }],
      },
    });
    expect(invalidHub.status).toBe(400);

    const malformed = await api("POST", "/api/attendees/import", {
      cookie: adminCookie,
      body: {
        circleId: 1,
        attendees: [
          { name: "Valid Row", email: TEST_EMAILS[0] },
          { name: " ", email: "not-an-email" },
        ],
      },
    });
    expect(malformed.status).toBe(400);

    const created = await db
      .select({ email: attendeesTable.email })
      .from(attendeesTable)
      .where(inArray(attendeesTable.email, TEST_EMAILS));
    expect(created).toHaveLength(0);
  });

  it("rejects inactive Hubs", async () => {
    const response = await api("POST", "/api/attendees/import", {
      cookie: adminCookie,
      body: {
        circleId: inactiveCircleId,
        attendees: [{ name: "Inactive Hub", email: TEST_EMAILS[0] }],
      },
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: "Select an active Hub before importing attendees" });
  });

  it("normalizes contacts, skips file duplicates, and skips existing emails", async () => {
    const firstImport = await api("POST", "/api/attendees/import", {
      cookie: adminCookie,
      body: {
        circleId: 1,
        attendees: [
          { name: "  CSV First  ", email: `  ${TEST_EMAILS[0].toUpperCase()}  `, company: "  Example Co  " },
          { name: "Duplicate First", email: TEST_EMAILS[0] },
        ],
      },
    });
    expect(firstImport.status).toBe(200);
    expect(firstImport.body).toMatchObject({
      createdCount: 1,
      skippedCount: 1,
      skipped: [{ row: 3, email: TEST_EMAILS[0], reason: "duplicate_file" }],
    });
    expect(firstImport.body.created[0]).toMatchObject({
      name: "CSV First",
      email: TEST_EMAILS[0],
      company: "Example Co",
      circleId: 1,
      role: "attendee",
    });

    const secondImport = await api("POST", "/api/attendees/import", {
      cookie: adminCookie,
      body: {
        circleId: 1,
        attendees: [
          { name: "Existing Contact", email: TEST_EMAILS[0] },
          { name: "  CSV Second  ", email: TEST_EMAILS[1] },
        ],
      },
    });
    expect(secondImport.status).toBe(200);
    expect(secondImport.body).toMatchObject({
      createdCount: 1,
      skippedCount: 1,
      skipped: [{ row: 2, email: TEST_EMAILS[0], reason: "duplicate_existing" }],
    });
    expect(secondImport.body.created[0]).toMatchObject({
      name: "CSV Second",
      email: TEST_EMAILS[1],
      circleId: 1,
    });
  });

  it("skips an email claimed by a simultaneous import", async () => {
    const body = {
      circleId: 1,
      attendees: [{ name: "Concurrent Import", email: TEST_EMAILS[2] }],
    };
    const results = await Promise.all([
      api("POST", "/api/attendees/import", { cookie: adminCookie, body }),
      api("POST", "/api/attendees/import", { cookie: adminCookie, body }),
    ]);

    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(results.reduce((total, result) => total + result.body.createdCount, 0)).toBe(1);
    expect(results.reduce((total, result) => total + result.body.skippedCount, 0)).toBe(1);
    expect(results.some((result) =>
      result.body.skipped.some((skipped: { reason: string }) => skipped.reason === "duplicate_existing"),
    )).toBe(true);
  });

  it("rejects an attendee email already registered in another Hub", async () => {
    const existing = await db
      .insert(attendeesTable)
      .values({
        name: "Cross Hub Existing",
        email: CROSS_HUB_EMAIL,
        company: "Existing Company",
        role: "attendee",
        circleId: 1,
      })
      .returning({ id: attendeesTable.id });
    expect(existing).toHaveLength(1);

    const manual = await api("POST", "/api/attendees", {
      cookie: adminCookie,
      body: {
        name: "Cross Hub Manual",
        email: CROSS_HUB_EMAIL,
        circleId: crossHubCircleId,
      },
    });
    expect(manual.status).toBe(409);
    expect(manual.body).toMatchObject({ error: "An attendee with this email already exists" });

    const imported = await api("POST", "/api/attendees/import", {
      cookie: adminCookie,
      body: {
        circleId: crossHubCircleId,
        attendees: [{ name: "Cross Hub Import", email: CROSS_HUB_EMAIL }],
      },
    });
    expect(imported.status).toBe(200);
    expect(imported.body).toMatchObject({
      createdCount: 0,
      skippedCount: 1,
      skipped: [{ row: 2, email: CROSS_HUB_EMAIL, reason: "duplicate_existing" }],
    });
  });
});