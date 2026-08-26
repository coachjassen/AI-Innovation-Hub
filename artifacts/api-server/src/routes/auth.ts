import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, attendeesTable } from "@workspace/db";
import {
  GENERIC_MAGIC_LINK_MESSAGE,
  issueMagicLink,
  verifyMagicLink,
} from "../lib/magic-link";
import { isSmtpConfigured } from "../lib/email";
import "../lib/session";

const router: IRouter = Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getAuthMode(): "magic_link" | "direct_admin" {
  return process.env.AUTH_MODE === "direct_admin" ? "direct_admin" : "magic_link";
}

function serializeAttendee(attendee: typeof attendeesTable.$inferSelect) {
  return {
    id: attendee.id,
    name: attendee.name,
    email: attendee.email,
    company: attendee.company,
    role: attendee.role,
    circleId: attendee.circleId,
    createdAt: attendee.createdAt.toISOString(),
  };
}

async function createSession(req: Request, attendee: typeof attendeesTable.$inferSelect): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
  req.session.attendeeId = attendee.id;
  req.session.attendeeRole = attendee.role;
}

router.get("/auth/config", (_req, res): void => {
  res.json({ mode: getAuthMode() });
});

router.post("/auth/direct-login", async (req, res): Promise<void> => {
  if (getAuthMode() !== "direct_admin") {
    res.status(404).json({ error: "Direct administrator sign-in is disabled" });
    return;
  }

  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string" || !emailPattern.test(email.trim())) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const [attendee] = await db
    .select()
    .from(attendeesTable)
    .where(eq(attendeesTable.email, normalizedEmail));

  if (!attendee) {
    res.status(401).json({ error: "No administrator account found with that email" });
    return;
  }
  if (attendee.role !== "admin") {
    res.status(403).json({ error: "Direct sign-in is limited to administrator accounts" });
    return;
  }

  await createSession(req, attendee);
  res.json(serializeAttendee(attendee));
});

router.post("/auth/request-link", async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };

  if (!email || typeof email !== "string" || !emailPattern.test(email.trim())) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!isSmtpConfigured()) {
    res.status(503).json({ error: "Email delivery is not configured. Please contact your facilitator." });
    return;
  }

  const [attendee] = await db
    .select()
    .from(attendeesTable)
    .where(eq(attendeesTable.email, normalizedEmail));

  if (!attendee) {
    // Return the same response when not found (security: don't reveal existence).
    res.json({ message: GENERIC_MAGIC_LINK_MESSAGE });
    return;
  }

  const result = await issueMagicLink(req, attendee);
  if (!result.ok && result.reason !== "rate_limited") {
    const message =
      result.reason === "application_url_missing"
        ? "Sign-in is not configured with a public application URL. Please contact your facilitator."
        : "We couldn't send the sign-in email. Please try again.";
    res.status(result.reason === "smtp_unavailable" ? 503 : 502).json({ error: message });
    return;
  }

  res.json({ message: GENERIC_MAGIC_LINK_MESSAGE });
});

router.post("/auth/verify", async (req, res): Promise<void> => {
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== "string" || token.length > 256) {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const attendee = await verifyMagicLink(token);
  if (!attendee) {
    res.status(400).json({ error: "This sign-in link is invalid or has expired. Request a new link." });
    return;
  }

  await createSession(req, attendee);
  res.json(serializeAttendee(attendee));
});

// POST /auth/logout
router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

// GET /auth/me
router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.attendeeId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [attendee] = await db
    .select()
    .from(attendeesTable)
    .where(eq(attendeesTable.id, req.session.attendeeId));

  if (!attendee) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  res.json(serializeAttendee(attendee));
});

export default router;
