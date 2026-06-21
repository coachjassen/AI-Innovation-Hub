import { Router, type IRouter } from "express";
import { eq, desc, count } from "drizzle-orm";
import { db, attendeesTable, goalsTable, surveyResponsesTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import "../lib/session";

const router: IRouter = Router();

router.get("/attendees", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(attendeesTable).orderBy(attendeesTable.name);

  // Get goal counts and survey response counts per attendee
  const goalCounts = await db
    .select({ attendeeId: goalsTable.attendeeId, cnt: count() })
    .from(goalsTable)
    .groupBy(goalsTable.attendeeId);

  const surveyCounts = await db
    .select({ attendeeId: surveyResponsesTable.attendeeId, cnt: count() })
    .from(surveyResponsesTable)
    .groupBy(surveyResponsesTable.attendeeId);

  const goalMap = new Map(goalCounts.map(r => [r.attendeeId, Number(r.cnt)]));
  const surveyMap = new Map(surveyCounts.map(r => [r.attendeeId, Number(r.cnt)]));

  const result = rows.map(a => ({
    id: a.id,
    name: a.name,
    email: a.email,
    company: a.company,
    role: a.role,
    circleId: a.circleId,
    createdAt: a.createdAt.toISOString(),
    lastActivityAt: null,
    goalCount: goalMap.get(a.id) ?? 0,
    surveyResponseCount: surveyMap.get(a.id) ?? 0,
  }));

  // Non-admins only see their own circle
  if (req.session.attendeeRole !== "admin") {
    const [me] = await db.select().from(attendeesTable).where(eq(attendeesTable.id, req.session.attendeeId!));
    const filtered = result.filter(a => a.circleId === me?.circleId);
    res.json(filtered);
    return;
  }

  // Admins may scope to a single circle via ?circleId
  const qCircleId = Array.isArray(req.query.circleId) ? req.query.circleId[0] : req.query.circleId;
  const circleId = qCircleId !== undefined ? parseInt(String(qCircleId), 10) : NaN;
  if (!isNaN(circleId)) {
    res.json(result.filter(a => a.circleId === circleId));
    return;
  }

  res.json(result);
});

router.get("/attendees/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [attendee] = await db.select().from(attendeesTable).where(eq(attendeesTable.id, id));
  if (!attendee) { res.status(404).json({ error: "Attendee not found" }); return; }

  const [goalCnt] = await db
    .select({ cnt: count() })
    .from(goalsTable)
    .where(eq(goalsTable.attendeeId, id));

  const [surveyCnt] = await db
    .select({ cnt: count() })
    .from(surveyResponsesTable)
    .where(eq(surveyResponsesTable.attendeeId, id));

  res.json({
    id: attendee.id,
    name: attendee.name,
    email: attendee.email,
    company: attendee.company,
    role: attendee.role,
    circleId: attendee.circleId,
    createdAt: attendee.createdAt.toISOString(),
    lastActivityAt: null,
    goalCount: Number(goalCnt?.cnt ?? 0),
    surveyResponseCount: Number(surveyCnt?.cnt ?? 0),
  });
});

router.patch("/attendees/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Non-admin can only update themselves
  if (req.session.attendeeRole !== "admin" && req.session.attendeeId !== id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { name, company } = req.body as { name?: string; company?: string };
  const updates: Partial<{ name: string; company: string }> = {};
  if (name !== undefined) updates.name = name;
  if (company !== undefined) updates.company = company;

  const [updated] = await db.update(attendeesTable).set(updates).where(eq(attendeesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Attendee not found" }); return; }
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

export default router;
