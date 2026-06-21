import { Router, type IRouter } from "express";
import { eq, and, count, sql } from "drizzle-orm";
import { db, goalsTable, attendeesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import "../lib/session";

const router: IRouter = Router();

function serializeGoal(g: typeof goalsTable.$inferSelect & { attendeeName?: string; attendeeCompany?: string }) {
  return {
    id: g.id,
    attendeeId: g.attendeeId,
    timeframe: g.timeframe,
    status: g.status,
    comments: g.comments,
    dueDate: g.dueDate ?? null,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    attendeeName: g.attendeeName,
    attendeeCompany: g.attendeeCompany,
  };
}

router.get("/goals/summary", requireAuth, async (req, res): Promise<void> => {
  let whereClause = undefined;
  if (req.session.attendeeRole !== "admin") {
    whereClause = eq(goalsTable.attendeeId, req.session.attendeeId!);
  }

  const rows = await db
    .select({ status: goalsTable.status, cnt: count() })
    .from(goalsTable)
    .where(whereClause)
    .groupBy(goalsTable.status);

  const byStatus = { new: 0, inProgress: 0, completed: 0, notStarted: 0 };
  let total = 0;
  for (const r of rows) {
    const n = Number(r.cnt);
    total += n;
    if (r.status === "New") byStatus.new += n;
    else if (r.status === "In Progress") byStatus.inProgress += n;
    else if (r.status === "Completed") byStatus.completed += n;
    else if (r.status === "Not Started") byStatus.notStarted += n;
  }

  res.json({ total, byStatus });
});

router.get("/goals", requireAuth, async (req, res): Promise<void> => {
  const { attendeeId: qAttendeeId, status: qStatus, showCompleted } = req.query as {
    attendeeId?: string; status?: string; showCompleted?: string;
  };

  const conditions = [];

  if (req.session.attendeeRole !== "admin") {
    conditions.push(eq(goalsTable.attendeeId, req.session.attendeeId!));
  } else if (qAttendeeId) {
    conditions.push(eq(goalsTable.attendeeId, parseInt(qAttendeeId, 10)));
  }

  if (qStatus) {
    conditions.push(eq(goalsTable.status, qStatus));
  }

  // If showCompleted is false, exclude Completed
  if (showCompleted === "false") {
    conditions.push(sql`${goalsTable.status} != 'Completed'`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: goalsTable.id,
      attendeeId: goalsTable.attendeeId,
      timeframe: goalsTable.timeframe,
      status: goalsTable.status,
      comments: goalsTable.comments,
      dueDate: goalsTable.dueDate,
      createdAt: goalsTable.createdAt,
      updatedAt: goalsTable.updatedAt,
      attendeeName: attendeesTable.name,
      attendeeCompany: attendeesTable.company,
    })
    .from(goalsTable)
    .leftJoin(attendeesTable, eq(goalsTable.attendeeId, attendeesTable.id))
    .where(whereClause)
    .orderBy(goalsTable.updatedAt);

  res.json(rows.map(r => serializeGoal({ ...r, attendeeName: r.attendeeName ?? undefined, attendeeCompany: r.attendeeCompany ?? undefined })));
});

router.post("/goals", requireAuth, async (req, res): Promise<void> => {
  const { timeframe, status, comments, dueDate } = req.body as { timeframe?: string; status?: string; comments?: string; dueDate?: string | null };
  if (!timeframe || !status) {
    res.status(400).json({ error: "timeframe and status are required" });
    return;
  }
  const attendeeId = req.session.attendeeId!;
  const [goal] = await db
    .insert(goalsTable)
    .values({ attendeeId, timeframe, status, comments: comments ?? null, dueDate: dueDate ? dueDate : null })
    .returning();
  res.status(201).json(serializeGoal(goal));
});

router.get("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, id));
  if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
  // Check ownership for non-admins
  if (req.session.attendeeRole !== "admin" && goal.attendeeId !== req.session.attendeeId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  res.json(serializeGoal(goal));
});

router.patch("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(goalsTable).where(eq(goalsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Goal not found" }); return; }
  if (req.session.attendeeRole !== "admin" && existing.attendeeId !== req.session.attendeeId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const { timeframe, status, comments, dueDate } = req.body as { timeframe?: string; status?: string; comments?: string; dueDate?: string | null };
  const updates: Partial<{ timeframe: string; status: string; comments: string; dueDate: string | null; updatedAt: Date }> = {
    updatedAt: new Date(),
  };
  if (timeframe !== undefined) updates.timeframe = timeframe;
  if (status !== undefined) updates.status = status;
  if (comments !== undefined) updates.comments = comments;
  if (dueDate !== undefined) updates.dueDate = dueDate ? dueDate : null;

  const [goal] = await db.update(goalsTable).set(updates).where(eq(goalsTable.id, id)).returning();
  res.json(serializeGoal(goal));
});

router.delete("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(goalsTable).where(eq(goalsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Goal not found" }); return; }
  if (req.session.attendeeRole !== "admin" && existing.attendeeId !== req.session.attendeeId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  await db.delete(goalsTable).where(eq(goalsTable.id, id));
  res.sendStatus(204);
});

export default router;
