import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, meetingsTable, attendeesTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import "../lib/session";

const router: IRouter = Router();

function serializeMeeting(m: typeof meetingsTable.$inferSelect) {
  return {
    id: m.id,
    circleId: m.circleId,
    date: m.date,
    notes: m.notes,
    slidesPath: m.slidesPath,
    keyInsight: m.keyInsight,
    createdAt: m.createdAt.toISOString(),
  };
}

router.get("/meetings", requireAuth, async (req, res): Promise<void> => {
  let rows;
  if (req.session.attendeeRole === "admin") {
    rows = await db.select().from(meetingsTable).orderBy(desc(meetingsTable.date));
  } else {
    const [me] = await db.select().from(attendeesTable).where(eq(attendeesTable.id, req.session.attendeeId!));
    if (!me) { res.status(401).json({ error: "Not found" }); return; }
    rows = await db
      .select()
      .from(meetingsTable)
      .where(eq(meetingsTable.circleId, me.circleId))
      .orderBy(desc(meetingsTable.date));
  }
  res.json(rows.map(serializeMeeting));
});

router.post("/meetings", requireAdmin, async (req, res): Promise<void> => {
  const { circleId, date, notes, slidesPath, keyInsight } = req.body as {
    circleId?: number; date?: string; notes?: string; slidesPath?: string; keyInsight?: string;
  };
  if (!circleId || !date) {
    res.status(400).json({ error: "circleId and date are required" });
    return;
  }
  const [meeting] = await db
    .insert(meetingsTable)
    .values({ circleId, date, notes: notes ?? null, slidesPath: slidesPath ?? null, keyInsight: keyInsight ?? null })
    .returning();
  res.status(201).json(serializeMeeting(meeting));
});

router.get("/meetings/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }
  res.json(serializeMeeting(meeting));
});

router.patch("/meetings/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { date, notes, slidesPath, keyInsight } = req.body as {
    date?: string; notes?: string; slidesPath?: string; keyInsight?: string;
  };
  const updates: Partial<{ date: string; notes: string; slidesPath: string; keyInsight: string }> = {};
  if (date !== undefined) updates.date = date;
  if (notes !== undefined) updates.notes = notes;
  if (slidesPath !== undefined) updates.slidesPath = slidesPath;
  if (keyInsight !== undefined) updates.keyInsight = keyInsight;
  const [meeting] = await db.update(meetingsTable).set(updates).where(eq(meetingsTable.id, id)).returning();
  if (!meeting) { res.status(404).json({ error: "Meeting not found" }); return; }
  res.json(serializeMeeting(meeting));
});

router.delete("/meetings/:id", requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(meetingsTable).where(eq(meetingsTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Meeting not found" }); return; }
  res.sendStatus(204);
});

export default router;
