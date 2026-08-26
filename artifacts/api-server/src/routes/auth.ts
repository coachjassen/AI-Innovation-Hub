import { Router, type IRouter } from "express";
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

router.post("/auth/request-link", async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };

  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
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

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
  req.session.attendeeId = attendee.id;
  req.session.attendeeRole = attendee.role;
  res.json({
    id: attendee.id,
    name: attendee.name,
    email: attendee.email,
    company: attendee.company,
    role: attendee.role,
    circleId: attendee.circleId,
    createdAt: attendee.createdAt.toISOString(),
  });
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

  res.json({
    id: attendee.id,
    name: attendee.name,
    email: attendee.email,
    company: attendee.company,
    role: attendee.role,
    circleId: attendee.circleId,
    createdAt: attendee.createdAt.toISOString(),
  });
});

export default router;
