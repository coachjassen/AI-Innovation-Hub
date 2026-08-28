import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, attendeesTable, circlesTable, goalsTable, magicTokensTable } from "@workspace/db";

vi.mock("../lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/email")>();
  return { ...actual, sendEmail: vi.fn(async () => ({ sent: true as const })) };
});

import app from "../app";
import { sendEmail } from "../lib/email";

const sendEmailMock = sendEmail as unknown as Mock;
const AUTH_EMAIL = `magic-link-auth-${process.pid}@example.test`;
const OTHER_EMAIL = `magic-link-other-${process.pid}@example.test`;
const RATE_EMAIL = `magic-link-rate-${process.pid}@example.test`;
const DIRECT_ADMIN_EMAIL = `direct-admin-${process.pid}@example.test`;
const ONE_OFF_ONLY_EMAIL = `one-off-only-${process.pid}@example.test`;
const PRIVATE_OWNER_EMAIL = `private-goal-owner-${process.pid}@example.test`;
const originalAuthMode = process.env.AUTH_MODE;

let server: Server;
let baseUrl: string;
let attendeeIds: number[] = [];
let recurringCircleId: number;
let oneOffCircleId: number;
let recurringMembershipId: number;
let oneOffOnlyMembershipId: number;
let mixedRoleAttendeeId: number;
let directAdminMembershipId: number;

interface ApiResult {
  status: number;
  body: unknown;
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
  const setCookieHeader = response.headers.get("set-cookie");
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    setCookie: setCookieHeader ? setCookieHeader.split(";")[0] : null,
  };
}

function latestTokenFromEmail(): string {
  const html = (sendEmailMock.mock.calls.at(-1)?.[0] as { html?: string } | undefined)?.html;
  const href = html?.match(/href="([^"]+)"/)?.[1];
  expect(href).toBeTruthy();
  expect(href).toMatch(/^https:\/\/hubs\.example\.test\/login\?token=/);
  const token = new URL(href as string).searchParams.get("token");
  expect(token).toBeTruthy();
  return token as string;
}

async function requestToken(email: string): Promise<string> {
  sendEmailMock.mockClear();
  const response = await api("POST", "/api/auth/request-link", { body: { email } });
  expect(response.status).toBe(200);
  expect(response.setCookie).toBeNull();
  return latestTokenFromEmail();
}

async function login(email: string): Promise<string> {
  const token = await requestToken(email);
  const response = await api("POST", "/api/auth/verify", { body: { token } });
  expect(response.status).toBe(200);
  expect(response.setCookie).toBeTruthy();
  return response.setCookie as string;
}

beforeAll(async () => {
  process.env.SMTP_HOST = "smtp.test";
  process.env.SMTP_USER = "test-user";
  process.env.SMTP_PASS = "test-password";
  process.env.SMTP_FROM = "hubs@example.test";
  process.env.APP_URL = "https://hubs.example.test";

  const [recurringCircle] = await db
    .insert(circlesTable)
    .values({
      name: `Auth Recurring Membership ${process.pid}`,
      cadence: "quarterly",
      status: "active",
    })
    .returning({ id: circlesTable.id });
  recurringCircleId = recurringCircle.id;
  const [oneOffCircle] = await db
    .insert(circlesTable)
    .values({
      name: `Auth One-Off Membership ${process.pid}`,
      cadence: "one-off",
      status: "active",
    })
    .returning({ id: circlesTable.id });
  oneOffCircleId = oneOffCircle.id;

  const [
    auth,
    other,
    rate,
    directAdmin,
    recurringMembership,
    oneOffMembership,
    oneOffOnly,
    privateOwner,
    mixedRoleAttendee,
  ] = await db
    .insert(attendeesTable)
    .values([
      { name: "Magic Link Test", email: AUTH_EMAIL, company: "Test Co", role: "attendee", circleId: 1 },
      { name: "Other Test", email: OTHER_EMAIL, company: "Test Co", role: "attendee", circleId: 1 },
      { name: "Rate Test", email: RATE_EMAIL, company: "Test Co", role: "attendee", circleId: 1 },
      { name: "Direct Admin Test", email: DIRECT_ADMIN_EMAIL, company: "Test Co", role: "admin", circleId: 1 },
      { name: "Magic Link Test", email: AUTH_EMAIL, company: "Test Co", role: "attendee", circleId: recurringCircleId },
      { name: "Magic Link Test", email: AUTH_EMAIL, company: "Test Co", role: "attendee", circleId: oneOffCircleId },
      { name: "One-Off Only Test", email: ONE_OFF_ONLY_EMAIL, company: "Test Co", role: "attendee", circleId: oneOffCircleId },
      { name: "Private Goal Owner", email: PRIVATE_OWNER_EMAIL, company: "Test Co", role: "attendee", circleId: 1 },
      { name: "Direct Admin Attendee Membership", email: DIRECT_ADMIN_EMAIL, company: "Test Co", role: "attendee", circleId: recurringCircleId },
    ])
    .returning({ id: attendeesTable.id });
  attendeeIds = [
    auth.id,
    other.id,
    rate.id,
    directAdmin.id,
    recurringMembership.id,
    oneOffMembership.id,
    oneOffOnly.id,
    privateOwner.id,
    mixedRoleAttendee.id,
  ];
  recurringMembershipId = recurringMembership.id;
  oneOffOnlyMembershipId = oneOffOnly.id;
  mixedRoleAttendeeId = mixedRoleAttendee.id;
  directAdminMembershipId = directAdmin.id;

  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  if (attendeeIds.length > 0) {
    await db.delete(goalsTable).where(inArray(goalsTable.attendeeId, attendeeIds));
    await db.delete(magicTokensTable).where(inArray(magicTokensTable.attendeeId, attendeeIds));
    await db.delete(attendeesTable).where(inArray(attendeesTable.id, attendeeIds));
  }
  await db.delete(circlesTable).where(inArray(circlesTable.id, [recurringCircleId, oneOffCircleId]));
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (originalAuthMode === undefined) {
    delete process.env.AUTH_MODE;
  } else {
    process.env.AUTH_MODE = originalAuthMode;
  }
});

describe("magic-link authentication", () => {
  it("returns the same public response for known and unknown email addresses", async () => {
    sendEmailMock.mockClear();
    const known = await api("POST", "/api/auth/request-link", { body: { email: AUTH_EMAIL } });
    const unknown = await api("POST", "/api/auth/request-link", { body: { email: `unknown-${process.pid}@example.test` } });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("uses one login to list and switch recurring Hub memberships while excluding one-off Hubs", async () => {
    const cookie = await login(AUTH_EMAIL);

    const circles = await api("GET", "/api/circles", { cookie });
    expect(circles.status).toBe(200);
    const circleIds = (circles.body as Array<{ id: number }>).map((circle) => circle.id);
    expect(circleIds).toContain(1);
    expect(circleIds).toContain(recurringCircleId);
    expect(circleIds).not.toContain(oneOffCircleId);

    const switched = await api("POST", "/api/auth/switch-hub", {
      cookie,
      body: { circleId: recurringCircleId },
    });
    expect(switched.status).toBe(200);
    expect(switched.body).toMatchObject({
      id: recurringMembershipId,
      email: AUTH_EMAIL,
      circleId: recurringCircleId,
    });

    const me = await api("GET", "/api/auth/me", { cookie });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: recurringMembershipId, circleId: recurringCircleId });

    const oneOffSwitch = await api("POST", "/api/auth/switch-hub", {
      cookie,
      body: { circleId: oneOffCircleId },
    });
    expect(oneOffSwitch.status).toBe(403);
  });

  it("does not send login links to attendees who only belong to one-off Hubs", async () => {
    sendEmailMock.mockClear();
    const response = await api("POST", "/api/auth/request-link", {
      body: { email: ONE_OFF_ONLY_EMAIL },
    });
    expect(response.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("rejects a token tied to a one-off-only attendee membership", async () => {
    const rawToken = `one-off-token-${process.pid}-${Date.now()}`;
    await db.insert(magicTokensTable).values({
      token: createHash("sha256").update(rawToken).digest("hex"),
      attendeeId: oneOffOnlyMembershipId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await api("POST", "/api/auth/verify", {
      body: { token: rawToken },
    });
    expect(response.status).toBe(400);
    expect(response.setCookie).toBeNull();
  });

  it("invalidates an existing attendee session when its Hub becomes inactive", async () => {
    const sessionEmail = `inactive-session-${process.pid}-${Date.now()}@example.test`;
    const rawToken = `inactive-session-token-${process.pid}-${Date.now()}`;
    const [circle] = await db
      .insert(circlesTable)
      .values({
        name: `Inactive Session Test ${process.pid}`,
        cadence: "monthly",
        status: "active",
      })
      .returning({ id: circlesTable.id });
    const [membership] = await db
      .insert(attendeesTable)
      .values({
        name: "Inactive Session Test",
        email: sessionEmail,
        company: "Test Co",
        role: "attendee",
        circleId: circle.id,
      })
      .returning({ id: attendeesTable.id });
    await db.insert(magicTokensTable).values({
      token: createHash("sha256").update(rawToken).digest("hex"),
      attendeeId: membership.id,
      expiresAt: new Date(Date.now() + 60_000),
    });

    try {
      const verified = await api("POST", "/api/auth/verify", {
        body: { token: rawToken },
      });
      expect(verified.status).toBe(200);
      expect(verified.setCookie).toBeTruthy();

      await db
        .update(circlesTable)
        .set({ status: "inactive" })
        .where(eq(circlesTable.id, circle.id));

      const me = await api("GET", "/api/auth/me", {
        cookie: verified.setCookie as string,
      });
      expect(me.status).toBe(401);
    } finally {
      await db.delete(magicTokensTable).where(eq(magicTokensTable.attendeeId, membership.id));
      await db.delete(attendeesTable).where(eq(attendeesTable.id, membership.id));
      await db.delete(circlesTable).where(eq(circlesTable.id, circle.id));
    }
  });

  it("treats administrator authorization as global to the verified email", async () => {
    const rawToken = `mixed-role-token-${process.pid}-${Date.now()}`;
    await db.insert(magicTokensTable).values({
      token: createHash("sha256").update(rawToken).digest("hex"),
      attendeeId: mixedRoleAttendeeId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const response = await api("POST", "/api/auth/verify", {
      body: { token: rawToken },
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: directAdminMembershipId,
      email: DIRECT_ADMIN_EMAIL,
      role: "admin",
    });
  });

  it("creates a session only after the emailed token is redeemed", async () => {
    const token = await requestToken(OTHER_EMAIL);
    const verified = await api("POST", "/api/auth/verify", { body: { token } });
    expect(verified.status).toBe(200);
    expect(verified.setCookie).toBeTruthy();

    const me = await api("GET", "/api/auth/me", { cookie: verified.setCookie as string });
    expect(me.status).toBe(200);
    expect((me.body as { email: string }).email).toBe(OTHER_EMAIL);
  });

  it("rejects a used link and an expired link", async () => {
    const token = await requestToken(AUTH_EMAIL);
    const firstUse = await api("POST", "/api/auth/verify", { body: { token } });
    const replay = await api("POST", "/api/auth/verify", { body: { token } });
    expect(firstUse.status).toBe(200);
    expect(replay.status).toBe(400);
    expect(replay.setCookie).toBeNull();

    const expiredRawToken = `expired-${process.pid}-${Date.now()}`;
    await db.insert(magicTokensTable).values({
      token: createHash("sha256").update(expiredRawToken).digest("hex"),
      attendeeId: attendeeIds[0],
      expiresAt: new Date(Date.now() - 1_000),
      createdAt: new Date(Date.now() - 16 * 60 * 1000),
    });
    const expired = await api("POST", "/api/auth/verify", { body: { token: expiredRawToken } });
    expect(expired.status).toBe(400);
  });

  it("invalidates a previous pending link when a fresh one is requested", async () => {
    const firstToken = await requestToken(AUTH_EMAIL);
    const secondToken = await requestToken(AUTH_EMAIL);

    const oldLink = await api("POST", "/api/auth/verify", { body: { token: firstToken } });
    const newestLink = await api("POST", "/api/auth/verify", { body: { token: secondToken } });
    expect(oldLink.status).toBe(400);
    expect(newestLink.status).toBe(200);
  });

  it("rate-limits repeated resend attempts without disclosing account state", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await requestToken(RATE_EMAIL);
    }
    sendEmailMock.mockClear();
    const limited = await api("POST", "/api/auth/request-link", { body: { email: RATE_EMAIL } });
    expect(limited.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("reports a deliberate SMTP configuration failure without creating a session", async () => {
    const smtpHost = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    const response = await api("POST", "/api/auth/request-link", { body: { email: AUTH_EMAIL } });
    process.env.SMTP_HOST = smtpHost;

    expect(response.status).toBe(503);
    expect(response.setCookie).toBeNull();
  });

  it("keeps direct administrator sign-in disabled unless explicitly configured", async () => {
    const priorMode = process.env.AUTH_MODE;
    delete process.env.AUTH_MODE;
    try {
      const response = await api("POST", "/api/auth/direct-login", { body: { email: DIRECT_ADMIN_EMAIL } });
      expect(response.status).toBe(404);
      expect(response.setCookie).toBeNull();
    } finally {
      if (priorMode === undefined) {
        delete process.env.AUTH_MODE;
      } else {
        process.env.AUTH_MODE = priorMode;
      }
    }
  });

  it("allows direct sign-in only for administrators when explicitly enabled", async () => {
    process.env.AUTH_MODE = "direct_admin";
    try {
      const config = await api("GET", "/api/auth/config");
      expect(config.status).toBe(200);
      expect(config.body).toEqual({ mode: "direct_admin" });

      const admin = await api("POST", "/api/auth/direct-login", { body: { email: DIRECT_ADMIN_EMAIL } });
      expect(admin.status).toBe(200);
      expect(admin.setCookie).toBeTruthy();
      expect((admin.body as { role: string }).role).toBe("admin");

      const attendee = await api("POST", "/api/auth/direct-login", { body: { email: AUTH_EMAIL } });
      expect(attendee.status).toBe(403);
      expect(attendee.setCookie).toBeNull();

      const unknown = await api("POST", "/api/auth/direct-login", {
        body: { email: `unknown-direct-${process.pid}@example.test` },
      });
      expect(unknown.status).toBe(401);
      expect(unknown.setCookie).toBeNull();
    } finally {
      delete process.env.AUTH_MODE;
    }
  });

  it("keeps attendee goals private to their owner", async () => {
    const ownerCookie = await login(PRIVATE_OWNER_EMAIL);
    const otherCookie = await login(OTHER_EMAIL);
    const created = await api("POST", "/api/goals", {
      cookie: ownerCookie,
      body: { timeframe: "Private objective", status: "New", comments: "Only the owner can view this" },
    });
    expect(created.status).toBe(201);

    const goalId = (created.body as { id: number }).id;
    const readAsOther = await api("GET", `/api/goals/${goalId}`, { cookie: otherCookie });
    expect(readAsOther.status).toBe(403);
  });
});