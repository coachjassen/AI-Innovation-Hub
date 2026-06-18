import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, attendeesTable } from "@workspace/db";
import "../lib/session";

const router: IRouter = Router();

// POST /auth/request-link
// POC mode: directly logs the user in by email (no email sending)
router.post("/auth/request-link", async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [attendee] = await db
    .select()
    .from(attendeesTable)
    .where(eq(attendeesTable.email, normalizedEmail));

  if (!attendee) {
    // Return 200 even when not found (security: don't reveal existence)
    // But for POC we give a clearer message
    res.status(404).json({ error: "No account found with that email. Contact your facilitator." });
    return;
  }

  // POC: directly create session (skip email + token)
  req.session.attendeeId = attendee.id;
  req.session.attendeeRole = attendee.role;

  res.json({ message: "Signed in successfully" });
});

// POST /auth/verify — kept for future magic-link flow
router.post("/auth/verify", async (req, res): Promise<void> => {
  const { token } = req.body as { token?: string };
  if (!token) {
    res.status(400).json({ error: "Token is required" });
    return;
  }
  // In POC mode, token-based flow is not active
  res.status(400).json({ error: "Magic link auth not active in this environment" });
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
