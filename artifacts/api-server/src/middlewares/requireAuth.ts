import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { attendeesTable, circlesTable, db } from "@workspace/db";
import "../lib/session";

async function getEligibleMembership(attendeeId: number) {
  const [membership] = await db
    .select({
      attendee: attendeesTable,
      cadence: circlesTable.cadence,
      status: circlesTable.status,
    })
    .from(attendeesTable)
    .innerJoin(circlesTable, eq(attendeesTable.circleId, circlesTable.id))
    .where(eq(attendeesTable.id, attendeeId));
  if (!membership) return null;
  if (
    membership.attendee.role !== "admin"
    && (membership.cadence === "one-off" || membership.status !== "active")
  ) {
    return null;
  }
  return membership.attendee;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.attendeeId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const attendee = await getEligibleMembership(req.session.attendeeId);
  if (!attendee) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  req.session.attendeeRole = attendee.role;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.attendeeId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const attendee = await getEligibleMembership(req.session.attendeeId);
  if (!attendee) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (attendee.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  req.session.attendeeRole = "admin";
  next();
}
