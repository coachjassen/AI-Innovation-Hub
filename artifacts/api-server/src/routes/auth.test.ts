import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, attendeesTable, goalsTable, magicTokensTable } from "@workspace/db";

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

let server: Server;
let baseUrl: string;
let attendeeIds: number[] = [];

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

  const [auth, other, rate] = await db
    .insert(attendeesTable)
    .values([
      { name: "Magic Link Test", email: AUTH_EMAIL, company: "Test Co", role: "attendee", circleId: 1 },
      { name: "Other Test", email: OTHER_EMAIL, company: "Test Co", role: "attendee", circleId: 1 },
      { name: "Rate Test", email: RATE_EMAIL, company: "Test Co", role: "attendee", circleId: 1 },
    ])
    .returning({ id: attendeesTable.id });
  attendeeIds = [auth.id, other.id, rate.id];

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
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
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

  it("keeps attendee goals private to their owner", async () => {
    const ownerCookie = await login(AUTH_EMAIL);
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